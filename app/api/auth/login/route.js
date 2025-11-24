import { z } from 'zod'
import prisma from '../../../../src/lib/prisma.js'
import { env, envHelpers } from '../../../../src/lib/env.js'
import { json, unauthorized, serverError } from '../../../../src/utils/http.js'
import { verifyPassword } from '../../../../src/utils/password.js'
import { signJwt, createAuthCookie, createRefreshCookie } from '../../../../src/lib/auth.js'
import { generateTokenPair } from '../../../../src/utils/tokens.js'
import { rateLimit } from '../../../../src/middleware/rate-limit.js'

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
})

const limiter = rateLimit({
  windowMs: env.rateLimit.loginWindowMs,
  max: env.rateLimit.loginMax,
  name: 'login',
})

export async function POST(request) {
  try {
    // Rate limit
    const rl = limiter.check(request)
    if (!rl.ok) {
      return json(
        { ok: false, error: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Try again later.' },
        { status: 429, headers: rl.headers }
      )
    }

    const bodyText = await request.text()
    if (!bodyText) return unauthorized('Invalid credentials')
    let body
    try {
      body = JSON.parse(bodyText)
    } catch {
      return unauthorized('Invalid credentials')
    }

    const parsed = LoginSchema.safeParse(body)
    if (!parsed.success) {
      return unauthorized('Invalid credentials')
    }
    const { email, password } = parsed.data

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, passwordHash: true, fullName: true, phoneE164: true, role: true, isEmailVerified: true },
    })
    // Use generic error for not found
    if (!user) {
      return unauthorized('Invalid credentials')
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return unauthorized('Invalid credentials')
    }

    if (!user.isEmailVerified) {
      return json(
        {
          ok: false,
          error: 'FORBIDDEN',
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Email address has not been verified.',
        },
        { status: 403, headers: rl.headers }
      )
    }

    // Get current timestamp for session tracking
    const loginTimestamp = Date.now()

    // Enforce single device login: invalidate sessions/tokens
    await prisma.$transaction([
      // Update lastLogin timestamp
      prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date(loginTimestamp) }
      }),
      // Revoke all existing refresh tokens for this user (logs out all devices after current access token expires)
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      // Delete expired refresh tokens
      prisma.refreshToken.deleteMany({
        where: { userId: user.id, expiresAt: { lt: new Date() } },
      }),
    ])

    // Access JWT with lastLoginAt for session validation (3 hours)
    const token = signJwt({ 
      sub: user.id, 
      role: user.role,
      lastLoginAt: loginTimestamp  // Track login time for device invalidation
    })
    const accessCookie = createAuthCookie({ token })

    // Create refresh token (opaque)
    const { token: refreshRaw, tokenHash } = generateTokenPair(32)
    const refreshExpiresAt = new Date(Date.now() + envHelpers.getRefreshTtlMs())
    await prisma.refreshToken.create({ data: { userId: user.id, tokenHash, expiresAt: refreshExpiresAt } })
    const refreshCookie = createRefreshCookie({ token: refreshRaw })

    const publicUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneE164: user.phoneE164 ?? null,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    }

    // Keep response shape stable for frontend
    const activeSession = null
    const autoSubmitted = { submittedCount: 0, finalizedAttemptIds: [] }

    return json(
      { ok: true, user: publicUser, activeSession, autoSubmitted },
      { status: 200, headers: { ...rl.headers, 'set-cookie': [accessCookie, refreshCookie] } }
    )
  } catch (_) {
    return serverError('Failed to login')
  }
}
