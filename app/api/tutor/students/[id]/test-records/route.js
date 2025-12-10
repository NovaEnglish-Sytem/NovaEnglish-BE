import prisma from '../../../../../../src/lib/prisma.js'
import { json, unauthorized, forbidden, notFound, serverError } from '../../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../../src/middleware/require-auth.js'

export async function GET(request, context) {
  try {
    // Authenticate + single-device validation
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return unauthorized(auth.error)
    const { payload } = auth

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, role: true }
    })

    if (!user) return unauthorized('User not found')
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return forbidden('Access denied. Tutor role required.')
    }

    const params = await context.params
    const studentId = params.id

    // Verify student exists
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, role: true }
    })

    if (!student || student.role !== 'STUDENT') {
      return notFound('Student not found')
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10)

    const skip = (page - 1) * pageSize

    // Get total count of TestRecords for pagination
    const total = await prisma.testRecord.count({
      where: {
        studentId,
        attempts: {
          some: { completedAt: { not: null } }
        }
      }
    })

    // Get paginated TestRecords (group by record, not individual attempts)
    const testRecords = await prisma.testRecord.findMany({
      where: {
        studentId,
        attempts: {
          some: { completedAt: { not: null } }
        }
      },
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
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize
    })

    // Get all records for attempt numbering
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

    // Format records - group multiple attempts in one record
    const records = testRecords.map(record => {
      const attemptNumber = recordAttemptNumbers[record.id] || 1
      
      // Get category scores and latest packageTitle per category (using snapshots on attempt)
      const categoryScores = {}
      const categoryLatest = {}
      let latestAttemptTime = 0
      let latestAttemptId = null

      record.attempts.forEach(attempt => {
        const catName = attempt.categoryName || 'Uncategorized'
        const completedAt = attempt.completedAt ? new Date(attempt.completedAt).getTime() : 0
        if (!categoryScores[catName]) categoryScores[catName] = 0
        categoryScores[catName] += attempt.totalScore || 0
        // Track latest packageTitle per category based on completedAt
        const prev = categoryLatest[catName]
        if (!prev || completedAt >= prev.completedAt) {
          categoryLatest[catName] = { completedAt, packageTitle: attempt.packageTitle || null }
        }

        if (completedAt >= latestAttemptTime) {
          latestAttemptTime = completedAt
          latestAttemptId = attempt.id
        }
      })
      
      // Find latest completion date
      const latestDate = record.attempts.reduce((latest, a) => {
        const date = new Date(a.completedAt)
        return date > latest ? date : latest
      }, new Date(0))
      
      return {
        recordId: record.id,
        attemptId: latestAttemptId,
        title: `Test ${attemptNumber}`,
        completedAt: latestDate,
        averageScore: Math.round((record.averageScore || 0) * 100) / 100,
        attemptsCount: record.attempts.length,
        categoryScores: Object.entries(categoryScores).map(([categoryName, score]) => ({
          categoryName,
          score: Math.round(score * 100) / 100,
          packageTitle: (categoryLatest[categoryName]?.packageTitle) || null,
        }))
      }
    })

    let bestScore = null

    // If first page, get best TestRecord by highest average score, then most categories, then newest createdAt
    if (page === 1) {
      const candidateRecords = await prisma.testRecord.findMany({
        where: {
          studentId,
          averageScore: { not: null }
        },
        include: {
          attempts: {
            where: { completedAt: { not: null } },
            select: {
              id: true,
              totalScore: true,
              categoryName: true,
              packageTitle: true,
              completedAt: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      })

      let bestRecord = null
      let bestAvg = 0
      let bestCategoryCount = -1
      let bestCreatedAt = null

      for (const rec of candidateRecords) {
        const avg = typeof rec.averageScore === 'number' ? rec.averageScore : 0
        const categoryCount = new Set((rec.attempts || []).map(a => a.categoryName).filter(Boolean)).size
        const createdAt = rec.createdAt || new Date(0)

        const isBetter =
          avg > bestAvg ||
          (avg === bestAvg && categoryCount > bestCategoryCount) ||
          (avg === bestAvg && categoryCount === bestCategoryCount && (!bestCreatedAt || createdAt > bestCreatedAt))

        if (isBetter) {
          bestRecord = rec
          bestAvg = avg
          bestCategoryCount = categoryCount
          bestCreatedAt = createdAt
        }
      }

      if (bestRecord) {
        const categoryScores = {}
        const categoryLatest = {}
        let latestAttemptTime = 0
        let latestAttemptId = null

        bestRecord.attempts.forEach(attempt => {
          const catName = attempt.categoryName || 'Uncategorized'
          if (!categoryScores[catName]) categoryScores[catName] = 0
          categoryScores[catName] += attempt.totalScore || 0
          const completedAt = attempt.completedAt ? new Date(attempt.completedAt).getTime() : 0
          const prev = categoryLatest[catName]
          if (!prev || completedAt >= prev.completedAt) {
            categoryLatest[catName] = { completedAt, packageTitle: attempt.packageTitle || null }
          }

          if (completedAt >= latestAttemptTime) {
            latestAttemptTime = completedAt
            latestAttemptId = attempt.id
          }
        })
        
        const attemptNumber = recordAttemptNumbers[bestRecord.id] || 1
        
        const latestDate = bestRecord.attempts.reduce((latest, a) => {
          const date = new Date(a.completedAt)
          return date > latest ? date : latest
        }, new Date(0))
        
        bestScore = {
          recordId: bestRecord.id,
          attemptId: latestAttemptId,
          title: `Test ${attemptNumber}`,
          completedAt: latestDate,
          averageScore: Math.round((bestAvg || 0) * 100) / 100,
          attemptsCount: bestRecord.attempts.length,
          categoryScores: Object.entries(categoryScores).map(([categoryName, score]) => ({
            categoryName,
            score: Math.round(score * 100) / 100,
            packageTitle: (categoryLatest[categoryName]?.packageTitle) || null,
          }))
        }
      }
    }

    const response = {
      ok: true,
      data: {
        records
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    }

    // Include bestScore only on first page
    if (page === 1 && bestScore) {
      response.data.bestScore = bestScore
    }

    return json(response)
  } catch (error) {
    console.error('Test records error:', error)
    return serverError('Failed to load test records')
  }
}
