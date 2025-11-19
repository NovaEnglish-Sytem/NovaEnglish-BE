import { z } from 'zod'
import prisma from '../../../../src/lib/prisma.js'
import { env, envHelpers } from '../../../../src/lib/env.js'
import { json, serverError } from '../../../../src/utils/http.js'
import { rateLimit } from '../../../../src/middleware/rate-limit.js'
import { generateTokenPair } from '../../../../src/utils/tokens.js'
import { sendPasswordResetEmail } from '../../../../src/lib/email.js'

const ForgotSchema = z.object({
  email: z.string().email().max(254),
})

const limiter = rateLimit({
  windowMs: env.rateLimit.forgotWindowMs,
  max: env.rateLimit.forgotMax,
  name: 'forgot',
})

export async function POST(request) {
  try {
    const rl = limiter.check(request)
    if (!rl.ok) {
      return json(
        { ok: false, error: 'TOO_MANY_REQUESTS', message: 'Too many requests. Try again later.' },
        { status: 429, headers: rl.headers }
      )
    }

    // Blind response pattern to avoid user enumeration.
    const generic = () =>
      json(
        { ok: true, message: 'If the email exists and is verified, a reset link has been sent.' },
        { status: 200, headers: rl.headers }
      )

    const bodyText = await request.text()
    if (!bodyText) return generic()
    let body
    try {
      body = JSON.parse(bodyText)
    } catch {
      return generic()
    }

    const parsed = ForgotSchema.safeParse(body)
    if (!parsed.success) return generic()
    const { email } = parsed.data

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, isEmailVerified: true },
    })
    if (!user || !user.isEmailVerified) {
      return generic()
    }

    // Create reset token
    const { token, tokenHash } = generateTokenPair(32)
    const expiresAt = new Date(Date.now() + envHelpers.getPasswordResetTtlMs())

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    })

    const resetUrl = `${env.appUrl}/account/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`

    // Send email; best-effort
    try { await sendPasswordResetEmail({ to: user.email, resetUrl }) } catch (_) {}

    return generic()
  } catch (_) {
    return serverError('Failed to process request')
  }
}
