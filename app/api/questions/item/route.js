import prisma from '../../../../src/lib/prisma.js'
import { requireAuth } from '../../../../src/middleware/require-auth.js'
import { sendError, sendSuccess } from '../../../../src/utils/http.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) }, select: { id: true, role: true } })
    if (!user) return sendError('User not found', 401)
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return sendError('Access denied. Tutor role required.', 403)
    }

    let body
    try { body = await request.json() } catch { return sendError('Invalid JSON body', 400) }
    const pageId = String(body?.pageId || '')
    const type = String(body?.type || '')
    if (!pageId) return sendError('pageId is required', 400)
    if (!['MULTIPLE_CHOICE','TRUE_FALSE_NOT_GIVEN','SHORT_ANSWER'].includes(type)) return sendError('Invalid type', 400)

    const page = await prisma.questionPage.findFirst({ where: { id: pageId }, select: { id: true } })
    if (!page) return sendError('QuestionPage not found', 404)

    const maxOrderRow = await prisma.questionItem.findFirst({ where: { pageId }, orderBy: { itemOrder: 'desc' } })
    const itemOrder = (maxOrderRow?.itemOrder || 0) + 1

    // Normalize SHORT_ANSWER inputs
    let question = String(body?.question || '')
    let answerText = null
    if (type === 'SHORT_ANSWER') {
      // Prefer extracting from bracketed template
      const matches = question.match(/\[([^\]]*)\]/g) || []
      if (matches.length > 0) {
        answerText = matches.map(m => m.replace(/^\[|\]$/g, '').trim())
      } else if (Array.isArray(body?.answerText)) {
        answerText = body.answerText.map(v => String(v ?? '').trim())
      } else if (typeof body?.answerText === 'string' && body.answerText.length > 0) {
        answerText = [String(body.answerText).trim()]
      } else {
        answerText = []
      }
    }

    const base = {
      pageId,
      itemOrder,
      type,
      question,
      choicesJson: type === 'MULTIPLE_CHOICE' ? [] : null,
      correctKey: null,
      answerText,
    }

    const item = await prisma.questionItem.create({ data: base, select: { id: true, itemOrder: true, createdAt: true } })
    return sendSuccess({ item }, 201)
  } catch (e) {
    console.error('POST /api/questions/item error:', e)
    return sendError('Failed to create item placeholder', 500)
  }
}
