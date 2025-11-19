import prisma from '../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'
import { getBandScoreWithFeedback } from '../../../../../src/utils/scoring.js'

export async function GET(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const studentId = String(payload.sub)
    const resolvedParams = await params
    const attemptId = String(resolvedParams.attemptId)

    const attempt = await prisma.testAttempt.findFirst({
      where: { 
        id: attemptId, 
        studentId,
        completedAt: { not: null } // Only allow access to completed attempts
      },
      include: {
        record: {
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
          }
        }
      }
    })
    
    if (!attempt) {
      return sendError('Result not found or test not completed', 404)
    }

    // Get band score and feedback from totalScore
    const bandScoreData = await getBandScoreWithFeedback(attempt.totalScore)
    const feedback = bandScoreData?.feedback || null
    const bandScore = bandScoreData?.band || null

    // All levels (read-only) for reference table (prefer bandScore; fallback to level; else [])
    let levels = []
    try {
      // Prefer legacy/new table named bandScore
      levels = await prisma.bandScore.findMany({ orderBy: { minScore: 'asc' } })
    } catch (e1) {
      try {
        levels = await prisma.level.findMany({ orderBy: { minScore: 'asc' } })
      } catch (e2) {
        levels = []
      }
    }
    
    // Test record info (for multi-category tracking)
    let recordInfo = null
    if (attempt.record) {
      const record = attempt.record
      const completedAttempts = record.attempts || []
      
      // Get unique completed category names
      const completedCategories = [...new Set(
        completedAttempts.map(a => a.categoryName).filter(Boolean)
      )]
      
      // Get all available categories count
      const allCategories = await prisma.questionCategory.findMany({
        where: {
          packages: {
            some: { status: 'PUBLISHED' }
          }
        },
        select: { id: true }
      })
      
      const categoriesComplete = completedCategories.length
      const categoriesTotal = allCategories.length
      const isComplete = categoriesComplete >= categoriesTotal
      
      recordInfo = {
        id: record.id,
        isComplete,
        categoriesComplete,
        categoriesTotal,
        averageScore: record.averageScore ?? null,
        attempts: completedAttempts.map(a => ({
          id: a.id,
          categoryName: a.categoryName,
          totalScore: a.totalScore ?? 0,
          completedAt: a.completedAt
        }))
      }
    }

    return sendSuccess({
      attemptId: attempt.id,
      completedAt: attempt.completedAt,
      totalScore: attempt.totalScore ?? 0,
      bandScore,
      feedback,
      packageTitle: attempt.packageTitle || 'Unknown Package',
      categoryName: attempt.categoryName || 'Unknown Category',
      levels,
      recordInfo
    })
  } catch (e) {
    console.error('GET /api/student/result/[attemptId] error:', e)
    return sendError('Failed to load result', 500)
  }
}

// CORS preflight
export function OPTIONS() {
  return new Response(null, { status: 204 })
}
