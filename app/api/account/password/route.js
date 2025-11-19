import { z } from 'zod'
import prisma from '../../../../src/lib/prisma.js'
import { badRequest, json, unauthorized, serverError } from '../../../../src/utils/http.js'
import { verifyPassword, hashPassword } from '../../../../src/utils/password.js'
import { requireAuthAndSession } from '../../../../src/middleware/require-auth.js'

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().min(8).max(200),
})

export async function PATCH(request) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return json({ ok: false, error: auth.error, code: auth.code }, auth.status)
    const { payload } = auth

    const bodyText = await request.text()
    if (!bodyText) return badRequest('Empty body')

    let body
    try {
      body = JSON.parse(bodyText)
    } catch {
      return badRequest('Invalid JSON body')
    }

    const parsed = ChangePasswordSchema.safeParse(body)
    if (!parsed.success) return badRequest('Validation failed', parsed.error?.issues)

    const { currentPassword, newPassword } = parsed.data

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, passwordHash: true },
    })
    if (!user) return unauthorized('Not authenticated')

    const ok = await verifyPassword(currentPassword, user.passwordHash)
    if (!ok) return unauthorized('Invalid current password')

    const newHash = await hashPassword(newPassword)

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    })

    // No email notification needed for this flow (per requirements)
    return json({ ok: true, message: 'Password changed successfully' }, 200)
  } catch (err) {
    console.error('Change password error:', err)
    return serverError('Failed to change password')
  }
}
