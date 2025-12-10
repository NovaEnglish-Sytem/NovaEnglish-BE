import prisma from '../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../src/utils/http.js'
import { ensureSingleActiveSession } from '../../../../../src/utils/session-cleanup.js'
import { autoSubmitExpiredSessions } from '../../../../../src/utils/auto-submit.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'

// GET /api/student/dashboard/summary
export async function GET(request) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const studentId = String(payload.sub)
    
    // Auto-submit expired sessions for this student (with grading)
    try {
      await autoSubmitExpiredSessions(studentId, 'dashboard')
    } catch (e) {}

    // Cleanup is non-blocking to keep dashboard fast
    Promise.all([
      // removeCompletedSessions(),
      ensureSingleActiveSession(studentId)
    ]).catch(() => {})

    const user = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, fullName: true }
    })
    if (!user) return sendError('User not found', 401)

    // Recent attempts summary (last 3)
    const recentAttempts = await prisma.testAttempt.findMany({
      where: { studentId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 3,
      select: {
        id: true,
        completedAt: true,
        totalScore: true,
        packageTitle: true,
        categoryName: true
      }
    })

    const recent = recentAttempts.map((a) => ({
      id: a.id,
      completedAt: a.completedAt,
      totalScore: Math.round(a.totalScore * 100) / 100,
      packageTitle: a.packageTitle || 'Unknown',
      categoryName: a.categoryName || 'Unknown'
    }))

    // Best score per category for this student (using snapshot categoryName)
    const allAttempts = await prisma.testAttempt.findMany({
      where: { studentId, completedAt: { not: null } },
      select: { categoryName: true, totalScore: true }
    })

    const bestByCategory = new Map()
    for (const a of allAttempts) {
      const cat = a.categoryName || 'Uncategorized'
      const score = a.totalScore || 0
      bestByCategory.set(cat, Math.max(score, bestByCategory.get(cat) ?? 0))
    }

    const categories = Array.from(bestByCategory.entries()).map(([name, best]) => ({ 
      name, 
      best: Math.round(best * 100) / 100 
    }))

    // Categories available (only categories with published question packages)
    // Use explicit package scan to avoid edge cases in relation filtering
    const publishedPkgs = await prisma.questionPackage.findMany({
      where: { status: 'PUBLISHED' },
      select: { categoryId: true }
    })
    const publishedCategoryIds = Array.from(new Set(publishedPkgs.map(p => p.categoryId).filter(Boolean)))
    const categoryList = publishedCategoryIds.length > 0
      ? await prisma.questionCategory.findMany({
          where: { id: { in: publishedCategoryIds } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' }
        })
      : []
    
    // Check for active test session (for auto-redirect)
    // CRITICAL FIX: Add orderBy to get most recent session
    const activeSession = await prisma.activeTestSession.findFirst({
      where: { 
        studentId,
        expiresAt: { gt: new Date() },
        attempt: {
          completedAt: null
        }
      },
      select: {
        attemptId: true,
        categoryName: true,
        expiresAt: true
      },
      orderBy: {
        lastActivity: 'desc'
      }
    })
    
    // Choose active record: most recent record that has at least one completed attempt
    const recentRecords = await prisma.testRecord.findMany({
      where: { studentId },
      include: {
        attempts: {
          where: { completedAt: { not: null } },
          select: { packageId: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    })
    let activeRecord = recentRecords.find(r => Array.isArray(r.attempts) && r.attempts.length > 0) || null
    // If none have completed attempts, fallback to the latest record (could be empty)
    if (!activeRecord) {
      activeRecord = await prisma.testRecord.findFirst({
        where: { studentId },
        orderBy: { createdAt: 'desc' }
      })
    }
    
    // Get completed category names in current record
    // Build set of completed category IDs in current record (map via package.categoryId)
    const completedCategoryIdSet = new Set()
    if (activeRecord) {
      // Some branches fetch activeRecord without attempts; ensure we have attempts for this record
      const attemptsForRecord = Array.isArray(activeRecord.attempts)
        ? activeRecord.attempts
        : await prisma.testAttempt.findMany({
            where: { recordId: activeRecord.id, completedAt: { not: null } },
            select: { packageId: true }
          })

      if (Array.isArray(attemptsForRecord) && attemptsForRecord.length > 0) {
        const pkgIds = attemptsForRecord.map(a => a.packageId).filter(Boolean)
        if (pkgIds.length > 0) {
          const pkgs = await prisma.questionPackage.findMany({
            where: { id: { in: Array.from(new Set(pkgIds)) } },
            select: { id: true, categoryId: true }
          })
          for (const p of pkgs) {
            if (p.categoryId) completedCategoryIdSet.add(p.categoryId)
          }
        }
      }
    }
    
    // Mark categories as completed if in active record
    const categoryListWithStatus = categoryList.map(cat => ({
      id: cat.id,
      name: cat.name,
      completedInCurrentRecord: completedCategoryIdSet.has(cat.id)
    }))

    // Determine whether the chosen record has completed all published categories
    const allComplete = categoryList.length > 0 && (completedCategoryIdSet.size >= categoryList.length)

    // Determine if the student has any historical record that completed all published categories
    let hasCompletedRecord = false
    if (publishedCategoryIds.length > 0) {
      const recordsWithAttempts = await prisma.testRecord.findMany({
        where: { studentId },
        include: {
          attempts: {
            where: { completedAt: { not: null } },
            select: { package: { select: { categoryId: true } } }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 25
      })
      for (const r of recordsWithAttempts) {
        const set = new Set((r.attempts || []).map(a => a.package?.categoryId).filter(Boolean))
        if (set.size >= publishedCategoryIds.length) {
          hasCompletedRecord = true
          break
        }
      }
    }

    // Greeting
    const greetingName = user.fullName

    // Overall Average Score: average of all TestRecord.averageScore for this student (rounded)
    const allRecordsWithAvg = await prisma.testRecord.findMany({
      where: { studentId, averageScore: { not: null } },
      select: { averageScore: true }
    })

    let overallBest = 0 // repurposed to mean Overall Average Score for the report card
    if (allRecordsWithAvg.length > 0) {
      const sum = allRecordsWithAvg.reduce((acc, r) => acc + Number(r.averageScore || 0), 0)
      overallBest = Math.round(sum / allRecordsWithAvg.length)
    }

    // Best Band Score (temporary): use best average score (rounded) without band table mapping
    const bestRecord = await prisma.testRecord.findFirst({
      where: { studentId, averageScore: { not: null } },
      orderBy: { averageScore: 'desc' },
      select: { averageScore: true }
    })

    let bestBand = null
    if (bestRecord && typeof bestRecord.averageScore === 'number') {
      bestBand = Math.round(bestRecord.averageScore)
    }

    // Count total test records for this student
    const recordCount = await prisma.testRecord.count({
      where: { studentId }
    })

    return sendSuccess({
      greeting: { name: greetingName },
      student: { id: user.id },
      recent,
      categories,
      categoryList: categoryListWithStatus,
      overallBest,
      bestBand,
      recordCount,
      activeRecord: activeRecord ? {
        id: activeRecord.id,
        completedCategories: Array.from(completedCategoryIdSet)
      } : null,
      allComplete,
      hasCompletedRecord,
      activeSession: activeSession ? {
        attemptId: activeSession.attemptId,
        categoryName: activeSession.categoryName,
        expiresAt: activeSession.expiresAt,
        isExpired: new Date(activeSession.expiresAt) < new Date()
      } : null,
    })
  } catch (e) {
    console.error('GET /api/student/dashboard/summary error:', e)
    return sendError('Failed to load dashboard', 500)
  }
}
