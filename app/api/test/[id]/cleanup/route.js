import prisma from '../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'

export async function POST(request, { params }) {
  try {
    // Try auth first, but allow cleanup even if session expired
    const auth = await requireAuthAndSession(request)
    const resolvedParams = await params
    const attemptId = String(resolvedParams.id)
    
    let studentId = null
    if (auth.ok) {
      // Use authenticated user ID
      studentId = String(auth.payload.sub)
    } else {
      // If auth failed, try to find attempt owner from database
      const attempt = await prisma.testAttempt.findUnique({
        where: { id: attemptId },
        select: { studentId: true }
      })
      if (!attempt) {
        // Attempt doesn't exist, cleanup is already done
        return sendSuccess({ cleaned: true, note: 'Already cleaned' })
      }
      studentId = attempt.studentId
    }

    // Use deleteMany for idempotent cleanup (won't fail if records don't exist)
    await prisma.$transaction(async (tx) => {
      await tx.temporaryAnswer.deleteMany({ where: { attemptId } })
      await tx.activeTestSession.deleteMany({ where: { attemptId } })
      await tx.testAttempt.deleteMany({ where: { id: attemptId, studentId } })
    })

    return sendSuccess({ cleaned: true })
  } catch (e) {
    return sendError('Failed to cleanup attempt', 500)
  }
}

export function OPTIONS() { return new Response(null, { status: 204 }) }
