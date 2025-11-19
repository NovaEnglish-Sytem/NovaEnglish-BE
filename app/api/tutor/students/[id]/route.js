import prisma from '../../../../../src/lib/prisma.js'
import { json, unauthorized, forbidden, serverError, notFound } from '../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'

export async function GET(request, context) {
  try {
    // AuthN + single-device validation
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return unauthorized(auth.error)
    const { payload } = auth

    const me = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, role: true }
    })
    if (!me) return unauthorized('User not found')
    if (me.role !== 'TUTOR' && me.role !== 'ADMIN') {
      return forbidden('Access denied. Tutor role required.')
    }

    const params = await context.params
    const studentId = String(params.id || '')
    if (!studentId) return notFound('Student not found')

    // Fetch student identity
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        role: true,
        fullName: true,
        email: true,
      }
    })
    if (!student || student.role !== 'STUDENT') {
      return notFound('Student not found')
    }

    return json({
      ok: true,
      data: {
        student: {
          id: student.id,
          fullName: student.fullName,
          email: student.email
        }
      }
    })
  } catch (error) {
    console.error('Student detail error:', error)
    return serverError('Failed to load student details')
  }
}
