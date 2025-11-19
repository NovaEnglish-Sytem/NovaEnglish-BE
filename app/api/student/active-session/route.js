import prisma from '../../../../src/lib/prisma.js'
import { sendSuccess, sendError } from '../../../../src/utils/http.js'
import { requireAuth } from '../../../../src/middleware/require-auth.js'
import { autoSubmitExpiredSessions } from '../../../../src/utils/auto-submit.js'

export async function GET(request) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    
    const { payload } = auth
    const studentId = String(payload.sub)
    
    // Only students can check their active session
    if (payload.role !== 'STUDENT') {
      return sendError('Forbidden', 403)
    }

    // Auto-submit any expired sessions
    let autoSubmitted = { submittedCount: 0, finalizedAttemptIds: [] }
    try {
      autoSubmitted = await autoSubmitExpiredSessions(studentId)
    } catch (e) {
      console.error('Failed to auto-submit expired sessions:', e)
      // Continue even if auto-submit fails
    }

    // Check for active test session (non-expired, incomplete)
    const session = await prisma.activeTestSession.findFirst({
      where: {
        studentId,
        expiresAt: { gt: new Date() },
        attempt: {
          completedAt: null
        }
      },
      select: {
        attemptId: true,
        categoryName: true,
        expiresAt: true
      },
      orderBy: {
        lastActivity: 'desc'
      }
    })

    let activeSession = null
    if (session) {
      activeSession = {
        attemptId: session.attemptId,
        categoryName: session.categoryName,
        expiresAt: session.expiresAt,
        isExpired: false
      }
    }

    try {
      await prisma.testRecord.deleteMany({ where: { studentId, attempts: { none: {} } } })
    } catch (_) {}
    return sendSuccess({ activeSession, autoSubmitted })
  } catch (e) {
    console.error('GET /api/student/active-session error:', e)
    return sendError('Failed to check active session', 500)
  }
}
