import { z } from 'zod'
import prisma from '../../../../src/lib/prisma.js'
import { ok, badRequest, notFound, serverError } from '../../../../src/utils/http.js'
import { hashPassword } from '../../../../src/utils/password.js'
import { sha256Hex } from '../../../../src/utils/tokens.js'
import { sendPasswordChangedEmail } from '../../../../src/lib/email.js'

const ResetSchema = z.object({
  email: z.string().email().max(254),
  token: z.string().min(1),
  newPassword: z.string().min(8).max(200),
})

// Validate reset token without consuming it (for page pre-check)
const QuerySchema = z.object({
  token: z.string().min(1),
  email: z.string().email().max(254),
})

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const qp = Object.fromEntries(url.searchParams.entries())
    const parsed = QuerySchema.safeParse(qp)
    if (!parsed.success) return badRequest('Validation failed', parsed.error?.issues)
    const { token, email } = parsed.data

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    })
    if (!user) return notFound('Invalid reset link')

    const tokenHash = sha256Hex(token)
    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, tokenHash },
    })
    if (!record) return notFound('Invalid or expired reset token')

    const now = new Date()
    if (now > record.expiresAt) {
      return new Response(
        JSON.stringify({ ok: false, error: 'GONE', message: 'Link expired. Please request a new verification link.' }),
        { status: 410, headers: { 'content-type': 'application/json; charset=utf-8' } }
      )
    }

    return ok({ message: 'Token is valid' })
  } catch (err) {
    return serverError('Failed to validate reset token')
  }
}

export async function POST(request) {
  try {
    const bodyText = await request.text()
    if (!bodyText) return badRequest('Empty body')
    let body
    try {
      body = JSON.parse(bodyText)
    } catch {
      return badRequest('Invalid JSON body')
    }

    const parsed = ResetSchema.safeParse(body)
    if (!parsed.success) return badRequest('Validation failed', parsed.error?.issues)
    const { email, token, newPassword } = parsed.data

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, isEmailVerified: true },
    })
    if (!user) return notFound('Invalid reset link')

    const tokenHash = sha256Hex(token)
    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, tokenHash },
    })
    if (!record) return notFound('Invalid or expired reset token')

    const now = new Date()
    if (now > record.expiresAt) {
      return new Response(
        JSON.stringify({ ok: false, error: 'GONE', message: 'Link expired. Please request a new verification link.' }),
        { status: 410, headers: { 'content-type': 'application/json; charset=utf-8' } }
      )
    }

    const newHash = await hashPassword(newPassword)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      }),
      // Delete this token and any others for the user
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    ])

    // Notify via email (best-effort)
    try { await sendPasswordChangedEmail({ to: user.email }) } catch (_) {}

    return ok({ message: 'Password has been reset successfully' })
  } catch (_) {
    return serverError('Failed to reset password')
  }
}
