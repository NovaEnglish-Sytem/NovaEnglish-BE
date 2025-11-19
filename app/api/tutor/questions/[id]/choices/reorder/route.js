import { requireAuthAndSession } from '../../../../../../../src/middleware/require-auth.js'
import prisma from '../../../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../../../src/utils/http.js'

export async function POST(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) }, select: { id: true, role: true } })
    if (!user) return sendError('User not found', 401)
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') return sendError('Access denied. Tutor role required.', 403)

    const { id: questionId } = params
    let body = {}
    try { body = await request.json() } catch (_) {}

    const orders = Array.isArray(body?.orders) ? body.orders : []
    if (orders.length === 0) return sendError('orders is required', 400)

    // Validate that all choices belong to the question
    const choiceIds = orders.map(o => String(o.choiceId))
    const choices = await prisma.choice.findMany({ where: { id: { in: choiceIds } }, select: { id: true, questionId: true } })
    const allBelong = choices.every(c => c.questionId === String(questionId))
    if (!allBelong || choices.length !== choiceIds.length) return sendError('Invalid choice ids', 400)

    await prisma.$transaction(
      orders.map(o => prisma.choice.update({ where: { id: String(o.choiceId) }, data: { order: Number(o.order) || 0 } }))
    )

    return sendSuccess({ message: 'Choices reordered' })
  } catch (e) {
    console.error('POST /api/tutor/questions/[id]/choices/reorder error:', e)
    return sendError('Failed to reorder choices', 500)
  }
}
