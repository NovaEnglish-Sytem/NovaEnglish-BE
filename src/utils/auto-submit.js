import prisma from '../lib/prisma.js'
import { cleanupAfterSubmit } from './session-cleanup.js'
import { gradeAttempt } from './grade-attempt.js'
import { updateRecordAverageScore } from './scoring.js'

/**
 * Auto-submit expired sessions when student returns
 * Grades temporary answers and finalizes attempts
 * @param {string} studentId - Student user ID
 * @returns {Promise<{submittedCount: number}>}
 */
export async function autoSubmitExpiredSessions(studentId) {
  const now = new Date()
  
  // Find all expired sessions for this student with incomplete attempts
  const expiredSessions = await prisma.activeTestSession.findMany({
    where: {
      studentId,
      expiresAt: { lt: now },
      attempt: {
        completedAt: null
      }
    },
    include: {
      attempt: {
        include: {
          package: {
            include: {
              pages: {
                include: {
                  questions: true
                }
              }
            }
          }
        }
      }
    }
  })
  
  if (expiredSessions.length === 0) {
    return { submittedCount: 0 }
  }
  
  let submittedCount = 0
  const finalizedAttemptIds = []
  
  // Process each expired session
  for (const session of expiredSessions) {
    try {
      await prisma.$transaction(async (tx) => {
        const attemptId = session.attemptId

        // Grade attempt using unified per-blank grading from TemporaryAnswer
        const { totalScore } = await gradeAttempt(attemptId, tx)

        // Update attempt with final score and completedAt = expiresAt
        await tx.testAttempt.update({
          where: { id: attemptId },
          data: {
            completedAt: session.expiresAt,
            totalScore,
            packageTitle: session.attempt.package?.title || null,
            categoryName: session.categoryName || null
          }
        })

        // Cleanup session and temp answers
        await cleanupAfterSubmit(attemptId, tx)

        // Update TestRecord average if this is part of a multi-category test
        if (session.recordId) {
          try {
            await updateRecordAverageScore(session.recordId, tx)
          } catch (err) {
            console.error('Failed to update record average for auto-submitted attempt:', err)
          }
        }

        submittedCount++
        finalizedAttemptIds.push(attemptId)
      })
    } catch (e) {
      console.error(`Failed to auto-submit attempt ${session.attemptId}:`, e)
      // Continue with other sessions
    }
  }
  
  return { submittedCount, finalizedAttemptIds }
}

/**
 * Grade a single answer
 * @param {object} tempAnswer - Temporary answer from database
 * @param {object} item - Question item
 * @returns {boolean}
 */
// Note: Per-blank grading is centralized in grade-attempt.js and reused here.
