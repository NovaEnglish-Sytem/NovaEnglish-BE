import prisma from '../../../../src/lib/prisma.js'
import { json, unauthorized, forbidden, serverError } from '../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../src/middleware/require-auth.js'

export async function GET(request) {
  try {
    // Authenticate + single-device validation
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return unauthorized(auth.error)
    const { payload } = auth

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, role: true },
    })

    if (!user) return unauthorized('User not found')
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return forbidden('Access denied. Tutor role required.')
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10)
    const search = (searchParams.get('search') || '').trim()

    const skip = (page - 1) * pageSize

    // Build where clause: only records with at least one completed attempt
    const where = {
      attempts: {
        some: { completedAt: { not: null } },
      },
    }

    if (search) {
      where.student = {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }
    }

    const total = await prisma.testRecord.count({ where })

    // Count all currently published categories (for latest-record progress)
    const totalPublishedCategories = await prisma.questionCategory.count({
      where: {
        packages: {
          some: { status: 'PUBLISHED' },
        },
      },
    })

    const recordsRaw = await prisma.testRecord.findMany({
      where,
      include: {
        student: {
          select: { id: true, fullName: true, email: true },
        },
        attempts: {
          where: { completedAt: { not: null } },
          select: {
            id: true,
            totalScore: true,
            categoryName: true,
            packageTitle: true,
            completedAt: true,
          },
          orderBy: { completedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    })

    const records = await Promise.all(recordsRaw.map(async (record) => {
      const categoryScores = {}
      const categoryLatest = {}
      let latestCompletedAt = null
      let latestAttemptId = null

      for (const attempt of record.attempts) {
        const catName = attempt.categoryName || 'Uncategorized'
        const completedAt = attempt.completedAt ? new Date(attempt.completedAt).getTime() : 0

        if (!categoryScores[catName]) categoryScores[catName] = 0
        categoryScores[catName] += attempt.totalScore || 0

        const prev = categoryLatest[catName]
        if (!prev || completedAt >= prev.completedAt) {
          categoryLatest[catName] = {
            completedAt,
            packageTitle: attempt.packageTitle || null,
          }
        }

        if (!latestCompletedAt || completedAt >= latestCompletedAt) {
          latestCompletedAt = completedAt
          latestAttemptId = attempt.id
        }
      }

      const completedAtDate = record.attempts.reduce((latest, a) => {
        const date = new Date(a.completedAt)
        return date > latest ? date : latest
      }, new Date(0))

      // Progress ratio per TestRecord
      const recordCategoryNames = Object.keys(categoryScores)
      const categoriesComplete = recordCategoryNames.length

      // Determine if this is the latest TestRecord for this student
      let categoriesTotal = categoriesComplete
      if (record.studentId) {
        const latestRecord = await prisma.testRecord.findFirst({
          where: { studentId: record.studentId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        const isLatestRecord = latestRecord && latestRecord.id === record.id

        if (isLatestRecord) {
          categoriesTotal = totalPublishedCategories
        }
      }

      // Ensure total is never less than completed categories
      if (categoriesComplete > categoriesTotal) {
        categoriesTotal = categoriesComplete
      }

      return {
        recordId: record.id,
        attemptId: latestAttemptId,
        title: `Test`,
        completedAt: completedAtDate,
        averageScore: Math.round((record.averageScore || 0) * 100) / 100,
        feedback: record.feedback || null,
        hasFeedback: !!(record.feedback && record.feedback.trim()),
        student: record.student,
        categoryScores: Object.entries(categoryScores).map(([categoryName, score]) => ({
          categoryName,
          score: Math.round(score * 100) / 100,
          packageTitle: categoryLatest[categoryName]?.packageTitle || null,
        })),
        categoriesComplete,
        categoriesTotal,
      }
    }))

    return json({
      ok: true,
      data: {
        records,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Tutor test records error:', error)
    return serverError('Failed to load test records')
  }
}
