import prisma from '../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../src/middleware/require-auth.js'
import { autoSubmitExpiredSessions } from '../../../../src/utils/auto-submit.js'

export async function GET(request) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const studentId = String(payload.sub)

    // Auto-submit expired sessions when opening test records
    try {
      await autoSubmitExpiredSessions(studentId, 'test-records')
    } catch (e) {}

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(50, parseInt(searchParams.get('pageSize') || '10', 10)))
    const sort = (searchParams.get('sort') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'

    // Group by TestRecord - show records with at least 1 completed attempt
    const testRecords = await prisma.testRecord.findMany({
      where: {
        studentId,
        attempts: {
          some: { completedAt: { not: null } }
        }
      },
      orderBy: { createdAt: sort },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        attempts: {
          where: { completedAt: { not: null } },
          select: {
            id: true,
            totalScore: true,
            categoryName: true,
            packageTitle: true,
            completedAt: true
          },
          orderBy: { completedAt: 'asc' }
        }
      }
    })

    const total = await prisma.testRecord.count({
      where: {
        studentId,
        attempts: {
          some: { completedAt: { not: null } }
        }
      }
    })

    // Calculate attempt number for each record (how many times student retook tests)
    const allRecords = await prisma.testRecord.findMany({
      where: { 
        studentId,
        attempts: {
          some: { completedAt: { not: null } }
        }
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    })
    const recordAttemptNumbers = {}
    allRecords.forEach((r, idx) => {
      recordAttemptNumbers[r.id] = idx + 1
    })

    const records = testRecords.map(record => {
      const attemptNumber = recordAttemptNumbers[record.id] || 1
      
      // Get all categories from attempts (using snapshot categoryName)
      const categoryScores = {}
      record.attempts.forEach(attempt => {
        const catName = attempt.categoryName || 'Uncategorized'
        if (!categoryScores[catName]) {
          categoryScores[catName] = 0
        }
        categoryScores[catName] += attempt.totalScore || 0
      })
      
      // Use averageScore from TestRecord
      const averageScore = record.averageScore || 0
      
      // Find latest completed date
      const latestDate = record.attempts.reduce((latest, a) => {
        const date = new Date(a.completedAt)
        return date > latest ? date : latest
      }, new Date(0))
      
      // Build ordered categories array using dashboard-like order (name asc)
      const orderedCategories = Object.entries(categoryScores)
        .map(([name, score]) => ({ name, score: Math.round(score * 100) / 100 }))
        .sort((a, b) => a.name.localeCompare(b.name))

      // Latest completed attempt id (attempts ordered asc by completedAt)
      const latestAttemptId = (record.attempts && record.attempts.length > 0)
        ? record.attempts[record.attempts.length - 1].id
        : null

      return {
        id: record.id,
        title: `Attempt ${attemptNumber}`,
        averageScore: Math.round(averageScore * 100) / 100,
        date: latestDate,
        categories: orderedCategories,
        attemptsCount: record.attempts.length,
        attemptId: latestAttemptId
      }
    })

    // Best score - pick TestRecord by highest averageScore, then most categories; if both equal, keep oldest record
    let bestScore = null
    if (page === 1) {
      const candidateRecords = await prisma.testRecord.findMany({
        where: {
          studentId,
          attempts: {
            some: { completedAt: { not: null } }
          },
          averageScore: { not: null }
        },
        include: {
          attempts: {
            where: { completedAt: { not: null } },
            select: {
              id: true,
              totalScore: true,
              categoryName: true,
              completedAt: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      })

      let bestRecord = null
      let bestAvg = -Infinity
      let bestCategoryCount = -1

      for (const rec of candidateRecords) {
        const avg = typeof rec.averageScore === 'number' ? rec.averageScore : 0
        const categoryCount = new Set((rec.attempts || []).map(a => a.categoryName).filter(Boolean)).size

        const isBetter =
          avg > bestAvg ||
          (avg === bestAvg && categoryCount > bestCategoryCount)

        if (isBetter) {
          bestRecord = rec
          bestAvg = avg
          bestCategoryCount = categoryCount
        }
      }

      if (bestRecord) {
        const categoryScores = {}
        bestRecord.attempts.forEach(attempt => {
          const catName = attempt.categoryName || 'Uncategorized'
          if (!categoryScores[catName]) {
            categoryScores[catName] = 0
          }
          categoryScores[catName] += attempt.totalScore || 0
        })

        const attemptNumber = recordAttemptNumbers[bestRecord.id] || 1

        // Find latest completed date
        const latestDate = bestRecord.attempts.reduce((latest, a) => {
          const date = new Date(a.completedAt)
          return date > latest ? date : latest
        }, new Date(0))

        // Build ordered categories for best score as well (name asc)
        const orderedBestCategories = Object.entries(categoryScores)
          .map(([name, score]) => ({ name, score: Math.round(score * 100) / 100 }))
          .sort((a, b) => a.name.localeCompare(b.name))

        // Latest completed attempt id for best record
        const latestAttemptId = (bestRecord.attempts && bestRecord.attempts.length > 0)
          ? bestRecord.attempts.reduce((latest, a) => {
              const latestCompleted = bestRecord.attempts.find(x => x.id === latest)?.completedAt || 0
              return (new Date(a.completedAt) > new Date(latestCompleted)) ? a.id : latest
            }, bestRecord.attempts[0].id)
          : null

        bestScore = {
          id: bestRecord.id,
          title: `Attempt ${attemptNumber}`,
          averageScore: Math.round((bestAvg || 0) * 100) / 100,
          date: latestDate,
          categories: orderedBestCategories,
          attemptId: latestAttemptId,
        }
      }
    }

    return sendSuccess({
      records,
      bestScore,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    })
  } catch (e) {
    console.error('GET /api/student/test-records error:', e)
    return sendError('Failed to load test records', 500)
  }
}
