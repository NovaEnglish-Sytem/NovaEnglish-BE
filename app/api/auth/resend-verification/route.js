import { z } from 'zod'
import prisma from '../../../../src/lib/prisma.js'
import { json, badRequest, serverError, tooManyRequests } from '../../../../src/utils/http.js'
import { generateTokenPair } from '../../../../src/utils/tokens.js'
import { sendVerificationEmail } from '../../../../src/lib/email.js'
import { env, envHelpers } from '../../../../src/lib/env.js'
import { rateLimit } from '../../../../src/middleware/rate-limit.js'

const ResendSchema = z.object({
  email: z.string().email().toLowerCase(),
})

export async function POST(request) {
  try {
    // Rate limiting (fix: proper usage)
    const limiter = rateLimit({
      name: 'resend-verification',
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: env.isProd ? 3 : 10, // more lenient in dev
    })
    const rl = limiter.check(request)
    if (!rl.ok) {
      return tooManyRequests('Too many resend attempts. Please try again later.')
    }

    // Parse body
    const bodyText = await request.text()
    if (!bodyText) return badRequest('Empty body')

    let body
    try {
      body = JSON.parse(bodyText)
    } catch {
      return badRequest('Invalid JSON body')
    }

    const parsed = ResendSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest('Invalid email address', parsed.error?.issues)
    }

    const { email } = parsed.data
    const probeOnly = (request.headers.get('x-probe-only') || '').toLowerCase() === 'true'
      || (typeof body?.probeOnly === 'boolean' ? body.probeOnly : false)

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, isEmailVerified: true },
    })

    if (!user) {
      return json({ ok: false, error: 'NOT_FOUND', message: 'Email not registered' }, 404)
    }

    if (probeOnly) {
      // Do not send email; just report status
      return json({ ok: true, verified: !!user.isEmailVerified, probe: true })
    }

    // Delete old and expired verification tokens for this user
    await prisma.verificationToken.deleteMany({ where: { userId: user.id } })

    // Generate new token
    const { token, tokenHash } = generateTokenPair(32)
    const expiresAt = new Date(Date.now() + envHelpers.getVerificationTtlMs())

    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    })

    // Send verification email (always, per UX requirement)
    try {
      const verifyUrl = `${env.appUrl}/account/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`
      await sendVerificationEmail({
        to: user.email,
        verifyUrl,
      })
    } catch (_) { }

    return json({ ok: true, message: 'Verification link has been sent to your email. Please check your inbox.' })
  } catch (_) {
    return serverError('Failed to resend verification email')
  }
}
