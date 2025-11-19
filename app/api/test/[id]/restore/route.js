import prisma from '../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../src/utils/http.js'
import { validateSessionToken, updateSessionActivity } from '../../../../../src/middleware/session-guard.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'

export async function GET(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth
    const studentId = String(payload.sub)
    
    const resolvedParams = await params
    const attemptId = resolvedParams.id
    if (!attemptId) return sendError('Attempt ID required', 400)
    
    // Verify session token
    const sessionToken = request.headers.get('x-session-token')
    if (sessionToken) {
      const isValid = await validateSessionToken(attemptId, sessionToken, studentId)
      if (!isValid) return sendError('Invalid session token', 403)
    }
    
    // Get attempt and temporary answers
    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, studentId },
      include: {
        temporaryAnswers: true,
        activeSession: true
      }
    })
    
    if (!attempt) return sendError('Test attempt not found', 404)
    if (attempt.completedAt) return sendError('Test already completed', 400)
    
    // Convert temporary answers to frontend format
    const answers = {}
    const audioCounts = {}
    
    for (const temp of attempt.temporaryAnswers) {
      const value = temp.selectedKey 
        ? temp.selectedKey 
        : temp.textAnswer || ''
      
      answers[temp.itemId] = {
        type: temp.selectedKey ? 'MULTIPLE_CHOICE' : 'SHORT_ANSWER',
        value
      }
      
      if (temp.audioPlayCount > 0) {
        audioCounts[temp.itemId] = temp.audioPlayCount
      }
    }
    
    // Update session activity
    await updateSessionActivity(attemptId)
    
    return sendSuccess({
      restored: true,
      answers,
      audioCounts,
      sessionToken: attempt.activeSession?.sessionToken,
      lastSavedAt: attempt.updatedAt,
      count: attempt.temporaryAnswers.length
    })
    
  } catch (e) {
    console.error('GET /api/test/[id]/restore error:', e)
    return sendError('Failed to restore test progress', 500)
  }
}

export function OPTIONS() { return new Response(null, { status: 204 }) }
