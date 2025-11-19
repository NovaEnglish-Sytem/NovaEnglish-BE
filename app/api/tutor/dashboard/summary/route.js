import prisma from '../../../../../src/lib/prisma.js'
import { json, unauthorized, forbidden, serverError } from '../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'

export async function GET(request) {
  try {
    // Authenticate + single-device validation
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return unauthorized(auth.error)
    const { payload } = auth

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, role: true, fullName: true }
    })

    if (!user) return unauthorized('User not found')
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return forbidden('Access denied. Tutor role required.')
    }

    // Get current month boundaries
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    // 1. Active students this month (based on lastLogin)
    const activeStudentsCount = await prisma.user.count({
      where: {
        role: 'STUDENT',
        lastLogin: { gte: startOfMonth }
      }
    })

    // 2. Test attempts this month (count TestRecord created within current month)
    const testAttemptsCount = await prisma.testRecord.count({
      where: {
        createdAt: { gte: startOfMonth, lt: startOfNextMonth },
        averageScore: { not: null }
      }
    })

    // 3. Most common band score (mode across students' best average scores)
    const mostCommonBandScore = await computeMostCommonBandScoreFromBestAverages()

    // 4. Class performance by category
    const classPerformance = await computeClassPerformance()

    // Use first name from full name for greeting
    const firstName = (user.fullName || 'Tutor').trim().split(/\s+/)[0] || 'Tutor'

    return json({
      ok: true,
      data: {
        nickname: firstName,
        activeStudentsThisMonth: activeStudentsCount > 0 ? activeStudentsCount : null,
        testAttemptsThisMonth: testAttemptsCount > 0 ? testAttemptsCount : null,
        // Keep the existing field name for UI compatibility
        mostCommonStudentLevel: mostCommonBandScore,
        classPerformance: classPerformance
      }
    })
  } catch (error) {
    console.error('Dashboard summary error:', error)
    return serverError('Failed to load dashboard summary')
  }
}

/**
 * Compute most common band score (mode) from each student's best TestRecord.averageScore
 * - Pull max(averageScore) per student
 * - Round to nearest integer for band bucketing (to match shield rounding)
 * - If tie, return the highest value
 */
async function computeMostCommonBandScoreFromBestAverages() {
  const bestPerStudent = await prisma.testRecord.groupBy({
    by: ['studentId'],
    _max: { averageScore: true }
  })

  if (!bestPerStudent.length) return 'N/A'

  // Round to nearest int and count frequency
  const freq = new Map()
  for (const row of bestPerStudent) {
    const avg = Number(row?._max?.averageScore ?? 0)
    if (!isFinite(avg) || avg <= 0) continue
    const rounded = Math.round(avg)
    const key = String(rounded)
    freq.set(key, (freq.get(key) ?? 0) + 1)
  }

  if (freq.size === 0) return 'N/A'

  // Find mode; if tie, pick the highest
  let modeKey = null
  let modeCount = -1
  for (const [key, count] of freq.entries()) {
    const num = Number(key)
    if (count > modeCount) {
      modeKey = key
      modeCount = count
    } else if (count === modeCount && modeKey !== null) {
      if (num > Number(modeKey)) {
        modeKey = key
      }
    }
  }

  return modeKey !== null ? modeKey : 'N/A'
}

/**
 * Compute class performance by category using band scores.
 * Rules:
 * - Only include attempts that completed all categories for their test paper.
 * - For each category, include the attempt's bandScore once if the attempt covered that category.
 * - Category score is the average of bandScore across included attempts.
 * - KPI avgScore (Average Band Score) = average of all category averages.
 * - KPI totalStudents = total users with role STUDENT.
 */
async function computeClassPerformance() {
  try {
    // Load completed attempts with category info
    const attempts = await prisma.testAttempt.findMany({
      where: { 
        completedAt: { not: null },
        categoryName: { not: null },
        totalScore: { gt: 0 }
      },
      select: {
        id: true,
        categoryName: true,
        totalScore: true,
        packageId: true
      }
    })

    if (!attempts.length) {
      const totalStudentsCount = await prisma.user.count({ where: { role: 'STUDENT' } })
      return { categories: [], kpis: { avgScore: 0, totalStudents: totalStudentsCount } }
    }

    // Aggregate scores per category
    const perCategoryAgg = new Map() // categoryName -> { sum, count }
    for (const attempt of attempts) {
      const catName = attempt.categoryName
      if (!perCategoryAgg.has(catName)) {
        perCategoryAgg.set(catName, { sum: 0, count: 0 })
      }
      perCategoryAgg.get(catName).sum += attempt.totalScore
      perCategoryAgg.get(catName).count += 1
    }

    // Compute averages and sort by category name (ascending)
    const categories = Array.from(perCategoryAgg.entries())
      .map(([name, { sum, count }]) => ({
        name,
        avgScore: count > 0 ? Math.round((sum / count) * 100) / 100 : 0
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))

    // Overall KPIs
    const totalStudentsCount = await prisma.user.count({ where: { role: 'STUDENT' } })
    const overallAvg = categories.length > 0
      ? categories.reduce((sum, c) => sum + c.avgScore, 0) / categories.length
      : 0

    return {
      categories,
      kpis: {
        avgScore: Math.round(overallAvg * 100) / 100,
        totalStudents: totalStudentsCount
      }
    }
  } catch (e) {
    console.error('computeClassPerformance error:', e)
    return { categories: [], kpis: { avgScore: 0, totalStudents: 0 } }
  }
}
