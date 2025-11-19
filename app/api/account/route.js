import { z } from 'zod'
import prisma from '../../../src/lib/prisma.js'
import { json, badRequest, serverError } from '../../../src/utils/http.js'
import { clearAuthCookie, clearRefreshCookie } from '../../../src/lib/auth.js'
import { requireAuthAndSession } from '../../../src/middleware/require-auth.js'

const UpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  phoneE164: z.union([z.string().regex(/^\+[1-9]\d{7,14}$/), z.null()]).optional(),
  placeOfBirth: z.union([z.string().trim().min(1).max(200), z.null()]).optional(),
  dateOfBirth: z.union([z.string().datetime(), z.null()]).optional(),
  gender: z.union([z.enum(['MALE', 'FEMALE']), z.null()]).optional(),
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

    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) return badRequest('Validation failed', parsed.error?.issues)

    // Build update data
    const data = {}
    if (parsed.data.fullName !== undefined) {
      const s = String(parsed.data.fullName || '')
      data.fullName = s.split(/\s+/).map(w => w ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : '').join(' ').trim()
    }
    if (parsed.data.phoneE164 !== undefined) {
      data.phoneE164 = parsed.data.phoneE164 === null ? null : String(parsed.data.phoneE164)
    }
    if (parsed.data.placeOfBirth !== undefined) {
      const v = parsed.data.placeOfBirth
      data.placeOfBirth = v === null ? null : String(v).split(/\s+/).map(w => w ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : '').join(' ').trim()
    }
    if (parsed.data.dateOfBirth !== undefined) data.dateOfBirth = parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null
    if (parsed.data.gender !== undefined) data.gender = parsed.data.gender ?? null

    if (Object.keys(data).length === 0) {
      return badRequest('No fields to update')
    }

    const updated = await prisma.user.update({
      where: { id: String(payload.sub) },
      data,
      select: { id: true, email: true, fullName: true, phoneE164: true, role: true, isEmailVerified: true, placeOfBirth: true, dateOfBirth: true, gender: true },
    })

    return json({ ok: true, user: updated }, 200)
  } catch (err) {
    console.error('Account update error:', err)
    return serverError('Failed to update account')
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return json({ ok: false, error: auth.error, code: auth.code }, auth.status)
    const { payload } = auth

    // Delete user; related tokens have onDelete: Cascade
    await prisma.user.delete({
      where: { id: String(payload.sub) },
    })

    const cleared = clearAuthCookie()
    const clearedRefresh = clearRefreshCookie()
    return json({ ok: true }, { status: 200, headers: { 'set-cookie': [cleared, clearedRefresh] } })
  } catch (err) {
    console.error('Account delete error:', err)
    return serverError('Failed to delete account')
  }
}
