import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'
import prisma from '../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../src/utils/http.js'

export async function PUT(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) }, select: { id: true, role: true } })
    if (!user) return sendError('User not found', 401)
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') return sendError('Access denied. Tutor role required.', 403)

    const { id } = params
    let body = {}
    try { body = await request.json() } catch (_) {}

    const data = {}
    if (typeof body?.textHtml === 'string') data.textHtml = body.textHtml
    if (typeof body?.isCorrect === 'boolean') data.isCorrect = body.isCorrect

    const choice = await prisma.choice.update({ where: { id: String(id) }, data })
    return sendSuccess({ choice })
  } catch (e) {
    console.error('PUT /api/tutor/choices/[id] error:', e)
    if (e?.code === 'P2025') return sendError('Choice not found', 404)
    return sendError('Failed to update choice', 500)
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) }, select: { id: true, role: true } })
    if (!user) return sendError('User not found', 401)
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') return sendError('Access denied. Tutor role required.', 403)

    const { id } = params

    await prisma.choice.delete({ where: { id: String(id) } })
    return sendSuccess({ message: 'Choice deleted' })
  } catch (e) {
    console.error('DELETE /api/tutor/choices/[id] error:', e)
    if (e?.code === 'P2025') return sendError('Choice not found', 404)
    return sendError('Failed to delete choice', 500)
  }
}
