import prisma from '../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'

export async function GET(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const resolvedParams = await params
    const attemptId = String(resolvedParams.id)
    const studentId = String(payload.sub)

    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, studentId },
      include: { package: { select: { status: true } } },
    })
    if (!attempt) return sendError('Attempt not found', 404)

    const raw = String(attempt.package?.status || '').toUpperCase()
    const status = raw === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
    return sendSuccess({ status })
  } catch (e) {
    return sendError('Failed to get package status', 500)
  }
}

export function OPTIONS() { return new Response(null, { status: 204 }) }
