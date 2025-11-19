import prisma from '../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../src/middleware/require-auth.js'

export async function POST(request) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth
    const studentId = String(payload.sub)
    
    // Get active session
    const activeSessions = await prisma.activeTestSession.findMany({
      where: { studentId },
      include: { attempt: true }
    })
    
    if (activeSessions.length === 0) {
      return sendSuccess({ 
        message: 'No active session found',
        cleaned: false 
      })
    }
    
    // Delete all active sessions and their temporary answers
    for (const session of activeSessions) {
      await prisma.temporaryAnswer.deleteMany({ 
        where: { attemptId: session.attemptId }
      })
    }
    
    await prisma.activeTestSession.deleteMany({ where: { studentId } })
    
    return sendSuccess({ 
      message: `Cleaned up ${activeSessions.length} active session(s)`,
      cleaned: true,
      count: activeSessions.length
    })
    
  } catch (e) {
    console.error('POST /api/test/force-cleanup error:', e)
    return sendError('Failed to cleanup session', 500)
  }
}

export function OPTIONS() { return new Response(null, { status: 204 }) }
