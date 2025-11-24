import prisma from '../lib/prisma.js'

// Remove duplicate sessions, keep only the most recent active session
export async function cleanupDuplicateSessions(studentId) {
  try {
    // Get all active sessions for student, ordered by most recent
    const sessions = await prisma.activeTestSession.findMany({
      where: { studentId },
      orderBy: { lastActivity: 'desc' }
    })

    if (sessions.length <= 1) {
      return 0 // No duplicates
    }

    // Keep first (most recent), delete rest
    const deleteIds = sessions.slice(1).map(s => s.id)
    const deleteAttemptIds = sessions.slice(1).map(s => s.attemptId)
    await prisma.$transaction([
      prisma.temporaryAnswer.deleteMany({ where: { attemptId: { in: deleteAttemptIds } } }),
      prisma.activeTestSession.deleteMany({ where: { id: { in: deleteIds } } })
    ])

    return deleteIds.length
  } catch (error) {
    console.error('Error cleaning duplicate sessions:', error)
    return 0
  }
}

export async function removeExpiredSessions() {
  try {
    const expired = await prisma.activeTestSession.findMany({
      where: { expiresAt: { lt: new Date() } },
      select: { id: true, attemptId: true }
    })
    if (expired.length === 0) return 0

    const ids = expired.map(s => s.id)
    const attemptIds = expired.map(s => s.attemptId)

    await prisma.$transaction([
      prisma.temporaryAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } }),
      prisma.activeTestSession.deleteMany({ where: { id: { in: ids } } })
    ])

    return ids.length
  } catch (error) {
    console.error('Error cleaning expired sessions:', error)
    return 0
  }
}

// Comprehensive cleanup - run periodically (e.g., every 5 minutes via cron)
export async function cleanupAllSessions() {
  const expired = await removeExpiredSessions()
  const completed = await removeCompletedSessions()
  
  return {
    expired,
    completed,
    total: expired + completed
  }
}

// Ensure only one active session per student (call before redirecting to test)
export async function ensureSingleActiveSession(studentId) {
  await cleanupDuplicateSessions(studentId)
}

/**
 * Finalize expired session without grading
 * Set attempt.completedAt to session.expiresAt
 * Delete ActiveSession and TemporaryAnswer
 * @param {string} attemptId - TestAttempt ID
 * @param {object} session - ActiveTestSession object with expiresAt
 * @param {object} tx - Prisma transaction client (optional)
 * @returns {Promise<void>}
 */
export async function finalizeExpiredSession(attemptId, session, tx = prisma) {
  await tx.testAttempt.update({
    where: { id: attemptId },
    data: { completedAt: session.expiresAt }
  })
  
  await tx.temporaryAnswer.deleteMany({
    where: { attemptId }
  })
  
  await tx.activeTestSession.delete({
    where: { id: session.id }
  })
}

/**
 * Auto-submit expired session with grading
 * Used when student returns after session expired
 * @param {string} attemptId - TestAttempt ID
 * @param {object} session - ActiveTestSession object
 * @param {Function} gradeFunction - Function to grade answers, receives (attemptId, tx)
 * @returns {Promise<{submitted: boolean, score?: number}>}
 */
export async function autoSubmitExpiredSession(attemptId, session, gradeFunction) {
  const now = new Date()
  
  // Check if session is actually expired
  if (session.expiresAt > now) {
    return { submitted: false }
  }
  
  return await prisma.$transaction(async (tx) => {
    // Grade the answers using provided grading function
    const gradeResult = await gradeFunction(attemptId, tx)
    
    // Set completedAt to expiresAt (when session actually expired)
    await tx.testAttempt.update({
      where: { id: attemptId },
      data: {
        completedAt: session.expiresAt,
        totalScore: gradeResult.totalScore
      }
    })
    
    // Cleanup session and temp answers
    await tx.temporaryAnswer.deleteMany({
      where: { attemptId }
    })
    
    await tx.activeTestSession.delete({
      where: { id: session.id }
    })
    
    return {
      submitted: true,
      score: gradeResult.totalScore
    }
  })
}

/**
 * Cleanup after successful submit
 * Delete ActiveSession and TemporaryAnswer
 * Keep TestAttempt with completedAt and score
 * @param {string} attemptId - TestAttempt ID
 * @param {object} tx - Prisma transaction client (optional)
 * @returns {Promise<void>}
 */
export async function cleanupAfterSubmit(attemptId, tx = prisma) {
  await tx.temporaryAnswer.deleteMany({
    where: { attemptId }
  })
  
  await tx.activeTestSession.deleteMany({
    where: { attemptId }
  })
}
