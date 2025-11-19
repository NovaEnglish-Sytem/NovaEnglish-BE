import { z } from 'zod'
import prisma from '../../../../src/lib/prisma.js'
import { json, badRequest, unauthorized, forbidden, notFound, serverError } from '../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../src/middleware/require-auth.js'
import { hashPassword } from '../../../../src/utils/password.js'

const ParamsSchema = z.object({
  // Accept legacy non-UUID ids as well
  id: z.string().min(1),
})

const getParamsObject = async (params) => (typeof params?.then === 'function' ? await params : params || {})

const UpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  phoneE164: z.union([z.string().regex(/^\+[1-9]\d{7,14}$/), z.null()]).optional(),
  role: z.enum(['STUDENT', 'TUTOR', 'ADMIN']).optional(),
  isEmailVerified: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
  placeOfBirth: z.union([z.string().trim().min(1).max(200), z.null()]).optional(),
  dateOfBirth: z.union([z.string().datetime(), z.null()]).optional(),
  gender: z.union([z.string().trim().min(1).max(50), z.null()]).optional(),
})

export async function PATCH(request, { params }) {
  try {
    // AuthN + single-device validation
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return unauthorized(auth.error)
    const { payload } = auth

    // AuthZ
    if (payload.role !== 'ADMIN') {
      return forbidden('Admin only')
    }

    // Validate path param
    const parsedParams = ParamsSchema.safeParse(await getParamsObject(params))
    if (!parsedParams.success) return badRequest('Invalid user id', parsedParams.error?.issues)
    const userId = parsedParams.data.id

    // Validate body
    const bodyText = await request.text()
    if (!bodyText) return badRequest('Empty body')

    let body
    try {
      body = JSON.parse(bodyText)
    } catch {
      return badRequest('Invalid JSON body')
    }

    const parsedBody = UpdateSchema.safeParse(body)
    if (!parsedBody.success) return badRequest('Validation failed', parsedBody.error?.issues)

    const data = {}
    if (parsedBody.data.fullName !== undefined) data.fullName = parsedBody.data.fullName
    if (parsedBody.data.phoneE164 !== undefined) data.phoneE164 = parsedBody.data.phoneE164 ?? null
    if (parsedBody.data.role !== undefined) data.role = parsedBody.data.role
    if (parsedBody.data.isEmailVerified !== undefined) data.isEmailVerified = parsedBody.data.isEmailVerified
    if (parsedBody.data.placeOfBirth !== undefined) data.placeOfBirth = parsedBody.data.placeOfBirth ?? null
    if (parsedBody.data.dateOfBirth !== undefined) data.dateOfBirth = parsedBody.data.dateOfBirth ? new Date(parsedBody.data.dateOfBirth) : null
    if (parsedBody.data.gender !== undefined) data.gender = parsedBody.data.gender ?? null
    if (parsedBody.data.password !== undefined) {
      data.passwordHash = await hashPassword(parsedBody.data.password)
    }

    if (Object.keys(data).length === 0) {
      return badRequest('No fields to update')
    }

    // Ensure target user exists
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!target) return notFound('User not found')

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneE164: true,
        role: true,
        isEmailVerified: true,
        placeOfBirth: true,
        dateOfBirth: true,
        gender: true,
        createdAt: true,
      },
    })

    // If admin verifies email, clean up any pending verification tokens for this user
    if (parsedBody.data.isEmailVerified === true) {
      try {
        await prisma.verificationToken.deleteMany({ where: { userId } })
      } catch (_) {}
    }

    return json({ ok: true, user: updated }, 200)
  } catch (err) {
    console.error('Admin update user error:', err)
    return serverError('Failed to update user')
  }
}

export async function DELETE(request, { params }) {
  try {
    // AuthN + single-device validation
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return unauthorized(auth.error)
    const { payload } = auth

    // AuthZ
    if (payload.role !== 'ADMIN') {
      return forbidden('Admin only')
    }

    // Validate path param
    const parsedParams = ParamsSchema.safeParse(await getParamsObject(params))
    if (!parsedParams.success) return badRequest('Invalid user id', parsedParams.error?.issues)
    const userId = parsedParams.data.id

    // Prevent deleting self
    if (payload.sub === userId) {
      return forbidden('You cannot delete your own account')
    }

    // Ensure target exists
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    })
    if (!target) return notFound('User not found')

    // Clean up related tokens (best-effort)
    try {
      await prisma.verificationToken.deleteMany({ where: { userId } })
    } catch (_) {}

    // Delete user
    await prisma.user.delete({ where: { id: userId } })

    return json({ ok: true }, 200)
  } catch (err) {
    console.error('Admin delete user error:', err)
    return serverError('Failed to delete user')
  }
}
