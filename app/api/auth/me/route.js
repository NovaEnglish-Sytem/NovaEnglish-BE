import prisma from '../../../../src/lib/prisma.js'
import { json, unauthorized, serverError } from '../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../src/middleware/require-auth.js'

export async function GET(request) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return unauthorized(auth.error)
    const { payload } = auth

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneE164: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        placeOfBirth: true,
        dateOfBirth: true,
        gender: true,
      },
    })

    if (!user) return unauthorized('Not authenticated')

    return json({ ok: true, user }, 200)
  } catch (err) {
    console.error('Auth me error:', err)
    return serverError('Failed to load profile')
  }
}
