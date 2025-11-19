import prisma from '../lib/prisma.js'

/**
 * Check if package associated with attempt is published
 * @param {string} attemptId - TestAttempt ID
 * @returns {Promise<{ok: boolean, reason?: string, attempt?: object}>}
 */
export async function checkPackagePublished(attemptId) {
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    include: {
      package: {
        select: { 
          id: true,
          status: true,
          title: true
        }
      }
    }
  })
  
  if (!attempt) {
    return { ok: false, reason: 'attempt_not_found' }
  }
  
  // Check if package was deleted (shouldn't happen with Restrict, but safety check)
  if (!attempt.package) {
    return { ok: false, reason: 'package_deleted' }
  }
  
  // Check if package is published
  if (attempt.package.status !== 'PUBLISHED') {
    return { ok: false, reason: 'package_draft' }
  }
  
  return { ok: true, attempt }
}

/**
 * Cleanup attempt when package becomes draft or deleted
 * Only deletes IN-PROGRESS attempts (completedAt = null)
 * Completed attempts are preserved for history
 * @param {string} attemptId - TestAttempt ID
 * @param {object} tx - Prisma transaction client (optional)
 * @returns {Promise<{deleted: boolean}>}
 */
export async function cleanupDraftAttempt(attemptId, tx = prisma) {
  const attempt = await tx.testAttempt.findUnique({
    where: { id: attemptId },
    select: { 
      id: true,
      completedAt: true,
      recordId: true
    }
  })
  
  // Don't delete completed attempts
  if (!attempt || attempt.completedAt !== null) {
    return { deleted: false }
  }
  
  // Delete in transaction order: TemporaryAnswer → ActiveTestSession → TestAttempt
  await tx.temporaryAnswer.deleteMany({
    where: { attemptId }
  })
  
  await tx.activeTestSession.deleteMany({
    where: { attemptId }
  })
  
  await tx.testAttempt.delete({
    where: { id: attemptId }
  })
  
  return { deleted: true }
}

/**
 * Cleanup all in-progress attempts for a package
 * Used when tutor changes package to DRAFT or deletes it
 * @param {string} packageId - QuestionPackage ID
 * @returns {Promise<{deletedCount: number}>}
 */
export async function cleanupPackageDraftAttempts(packageId) {
  const inProgressAttempts = await prisma.testAttempt.findMany({
    where: {
      packageId,
      completedAt: null
    },
    select: { id: true }
  })
  
  const attemptIds = inProgressAttempts.map(a => a.id)
  
  if (attemptIds.length === 0) {
    return { deletedCount: 0 }
  }
  
  await prisma.$transaction([
    prisma.temporaryAnswer.deleteMany({
      where: { attemptId: { in: attemptIds } }
    }),
    prisma.activeTestSession.deleteMany({
      where: { attemptId: { in: attemptIds } }
    }),
    prisma.testAttempt.deleteMany({
      where: { id: { in: attemptIds } }
    })
  ])
  
  return { deletedCount: attemptIds.length }
}
