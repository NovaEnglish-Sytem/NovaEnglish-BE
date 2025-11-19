import { requireAuthAndSession } from '../../../../../../src/middleware/require-auth.js'
import prisma from '../../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../../src/utils/http.js'

// POST /api/tutor/pages/[pageId]/items
export async function POST(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) }, select: { id: true, role: true } })
    if (!user) return sendError('User not found', 401)
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return sendError('Access denied. Tutor role required.', 403)
    }

    const { pageId } = params
    const page = await prisma.questionPage.findFirst({ where: { id: String(pageId) } })
    if (!page) return sendError('QuestionPage not found', 404)

    let body = {}
    try { body = await request.json() } catch (_) {}

    const type = String(body?.type || '').toUpperCase()
    const question = String(body?.question || body?.promptHtml || '').trim() // Support both old and new field names
    const itemOrder = Number.isInteger(body?.itemOrder) ? body.itemOrder : undefined

    if (!['MULTIPLE_CHOICE', 'TRUE_FALSE_NOT_GIVEN', 'SHORT_ANSWER'].includes(type)) {
      return sendError('Invalid type', 400)
    }
    if (!question) {
      return sendError('question is required', 400)
    }

    let finalOrder = itemOrder
    if (finalOrder === undefined) {
      const last = await prisma.questionItem.findFirst({
        where: { pageId: page.id },
        orderBy: { itemOrder: 'desc' },
        select: { itemOrder: true }
      })
      finalOrder = (last?.itemOrder ?? 0) + 1
    }

    // Optional media
    let mediaId = undefined
    if (body?.mediaId) {
      const media = await prisma.mediaAsset.findFirst({ where: { id: String(body.mediaId) } })
      if (!media) return sendError('MediaAsset not found', 404)
      mediaId = media.id
    }

    // Choice or answer fields
    const choicesJson = body?.choicesJson ?? null
    // Support both array (legacy) and string (current) format for correctKey
    const correctKey = Array.isArray(body?.correctKeys) && body.correctKeys.length > 0 
      ? String(body.correctKeys[0]) 
      : (body?.correctKey ? String(body.correctKey) : null)

    // Normalize SHORT_ANSWER answers: extract from template if present, or accept array
    let answerText = null
    let finalQuestion = question
    if (type === 'SHORT_ANSWER') {
      if (Array.isArray(body?.answerText)) {
        answerText = body.answerText.map(v => String(v ?? '').trim())
      } else if (typeof body?.answerText === 'string' && body.answerText.length > 0) {
        // single string fallback -> single-element array
        answerText = [String(body.answerText).trim()]
      } else {
        // derive from bracket template
        const matches = finalQuestion.match(/\[([^\]]*)\]/g) || []
        answerText = matches.map(m => m.replace(/^\[|\]$/g, '').trim())
      }
    }

    const item = await prisma.questionItem.create({
      data: {
        pageId: page.id,
        itemOrder: finalOrder,
        type,
        question: finalQuestion,
        choicesJson,
        correctKey,
        answerText,
        mediaId: mediaId ?? null,
      }
    })

    return sendSuccess({ item }, 201)
  } catch (error) {
    console.error('POST /api/tutor/pages/[pageId]/items error:', error)
    return sendError('Failed to create item', 500)
  }
}

export function GET() { return sendError('Method Not Allowed', 405) }
export function PUT() { return sendError('Method Not Allowed', 405) }
export function DELETE() { return sendError('Method Not Allowed', 405) }
