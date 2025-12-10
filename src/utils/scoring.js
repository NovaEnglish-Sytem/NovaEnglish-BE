import prisma from '../lib/prisma.js'

/**
 * Calculate percentage score from correct answers
 * Formula: (correct / total) * 100
 * @param {number} correctAnswers - Number of correct answers
 * @param {number} totalQuestions - Total number of questions
 * @returns {number} Score as percentage with 2 decimal places
 */
export function calculateScore(correctAnswers, totalQuestions) {
  if (totalQuestions === 0) return 0
  return parseFloat(((correctAnswers / totalQuestions) * 100).toFixed(2))
}

/**
 * Calculate average score from multiple attempts
 * Formula: SUM(totalScore) / COUNT(attempts)
 * @param {Array<{totalScore: number}>} attempts - Array of attempts with totalScore
 * @returns {number} Average score with 2 decimal places
 */
export function calculateAverageScore(attempts) {
  if (!attempts || attempts.length === 0) return 0
  const sum = attempts.reduce((acc, attempt) => acc + attempt.totalScore, 0)
  return parseFloat((sum / attempts.length).toFixed(2))
}

/**
 * Calculate and update TestRecord average score
 * Call this after a category attempt is completed
 * @param {string} recordId - TestRecord ID
 * @param {object} tx - Prisma transaction client (optional)
 * @returns {Promise<{averageScore: number, allComplete: boolean}>}
 */
export async function updateRecordAverageScore(recordId, tx = prisma) {
  const record = await tx.testRecord.findUnique({
    where: { id: recordId },
    include: {
      attempts: {
        where: { completedAt: { not: null } },
        select: { totalScore: true }
      }
    }
  })
  
  if (!record) {
    throw new Error('TestRecord not found')
  }
  
  const averageScore = calculateAverageScore(record.attempts)
  
  await tx.testRecord.update({
    where: { id: recordId },
    data: { averageScore }
  })
  
  return {
    averageScore,
    allComplete: record.attempts.length > 0
  }
}
