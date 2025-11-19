import { z } from 'zod'
import prisma from '../../../../src/lib/prisma.js'
import { ok, badRequest, notFound, serverError } from '../../../../src/utils/http.js'
import { sha256Hex } from '../../../../src/utils/tokens.js'

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
      select: { id: true, isEmailVerified: true },
    })
    if (!user) return notFound('Invalid verification link')

    // If already verified, short-circuit
    if (user.isEmailVerified) {
      return ok({ message: 'Account already verified' })
    }

    const tokenHash = sha256Hex(token)

    const record = await prisma.verificationToken.findFirst({
      where: { userId: user.id, tokenHash },
    })
    if (!record) return notFound('Invalid or expired verification token')

    const now = new Date()
    if (now > record.expiresAt) {
      return new Response(
        JSON.stringify({ ok: false, error: 'GONE', message: 'Link expired. Please request a new verification link.' }),
        { status: 410, headers: { 'content-type': 'application/json; charset=utf-8' } }
      )
    }

    // Mark user verified and token used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true },
      }),
      // Cleanup all tokens for this user
      prisma.verificationToken.deleteMany({ where: { userId: user.id } }),
    ])

    return ok({ message: 'Email verified successfully' })
  } catch (_) {
    return serverError('Failed to verify email')
  }
}