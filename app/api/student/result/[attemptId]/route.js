import prisma from '../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'

export async function GET(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const role = String(payload.role || '').toUpperCase()
    const studentId = String(payload.sub)
    const resolvedParams = await params
    const attemptId = String(resolvedParams.attemptId)

    const baseWhere = {
      id: attemptId,
      completedAt: { not: null }, // Only allow access to completed attempts
    }

    const where = role === 'STUDENT'
      ? { ...baseWhere, studentId }
      : baseWhere

    const attempt = await prisma.testAttempt.findFirst({
      where,
      include: {
        student: {
          select: { id: true, fullName: true, email: true },
        },
        record: {
          include: {
            // Include all attempts for this record; we'll derive completed/total categories from here
            attempts: {
              select: {
                id: true,
                totalScore: true,
                categoryName: true,
                completedAt: true,
              },
            },
          },
        },
      },
    })
    
    if (!attempt) {
      return sendError('Result not found or test not completed', 404)
    }

    // Feedback is now stored directly on TestRecord (multi-category test)
    const recordFeedback = attempt.record?.feedback ?? null
    
    // Test record info (for multi-category tracking)
    let recordInfo = null
    if (attempt.record) {
      const record = attempt.record
      const allAttempts = record.attempts || []
      const completedAttempts = allAttempts.filter(a => a.completedAt !== null)

      // Categories that belong to this record (regardless of completion)
      const recordCategories = [...new Set(
        allAttempts.map(a => a.categoryName).filter(Boolean)
      )]

      // Categories that have at least one completed attempt in this record
      const completedCategories = [...new Set(
        completedAttempts.map(a => a.categoryName).filter(Boolean)
      )]

      // Determine whether this TestRecord is the latest one for that student
      const latestRecord = await prisma.testRecord.findFirst({
        where: { studentId: record.studentId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      const isLatestRecord = latestRecord && latestRecord.id === record.id

      let categoriesTotal
      if (isLatestRecord) {
        // Latest record: measure against all currently published categories
        const publishedCategories = await prisma.questionCategory.findMany({
          where: {
            packages: {
              some: { status: 'PUBLISHED' },
            },
          },
          select: { id: true },
        })
        categoriesTotal = publishedCategories.length
      } else {
        // Older records: measure only against categories that belong to this record
        categoriesTotal = recordCategories.length
      }

      const categoriesComplete = completedCategories.length

      // Ensure total is never less than completed categories
      if (categoriesComplete > categoriesTotal) {
        categoriesTotal = categoriesComplete
      }

      const isComplete = categoriesTotal > 0 && categoriesComplete >= categoriesTotal

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
          completedAt: a.completedAt,
        })),
      }
    }

    return sendSuccess({
      attemptId: attempt.id,
      completedAt: attempt.completedAt,
      totalScore: attempt.totalScore ?? 0,
      packageTitle: attempt.packageTitle || 'Unknown Package',
      categoryName: attempt.categoryName || 'Unknown Category',
      feedback: recordFeedback,
      student: attempt.student
        ? {
            id: attempt.student.id,
            fullName: attempt.student.fullName,
            email: attempt.student.email,
          }
        : null,
      recordInfo,
    })
  } catch (e) {
    console.error('GET /api/student/result/[attemptId] error:', e)
    return sendError('Failed to load result', 500)
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const role = String(payload.role || '').toUpperCase()
    if (role !== 'TUTOR' && role !== 'ADMIN') {
      return sendError('Access denied. Tutor or Admin role required.', 403)
    }

    const resolvedParams = await params
    const attemptId = String(resolvedParams.attemptId)

    const body = await request.json()
    const rawFeedback = typeof body?.feedback === 'string' ? body.feedback : ''
    const feedback = rawFeedback.trim()

    const attempt = await prisma.testAttempt.findFirst({
      where: {
        id: attemptId,
        completedAt: { not: null },
      },
      select: {
        id: true,
        recordId: true,
      },
    })

    if (!attempt || !attempt.recordId) {
      return sendError('Result not found or test not completed', 404)
    }

    const updatedRecord = await prisma.testRecord.update({
      where: { id: attempt.recordId },
      data: { feedback },
      select: { id: true, feedback: true },
    })

    return sendSuccess({
      recordId: updatedRecord.id,
      feedback: updatedRecord.feedback ?? null,
    })
  } catch (e) {
    console.error('PUT /api/student/result/[attemptId] error:', e)
    return sendError('Failed to save feedback', 500)
  }
}

// CORS preflight
export function OPTIONS() {
  return new Response(null, { status: 204 })
}
