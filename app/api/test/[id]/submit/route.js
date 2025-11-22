import prisma from '../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'
import { checkPackagePublished, cleanupDraftAttempt } from '../../../../../src/utils/draft-guard.js'
import { cleanupAfterSubmit } from '../../../../../src/utils/session-cleanup.js'
import { calculateScore, updateRecordAverageScore } from '../../../../../src/utils/scoring.js'
import { validateSessionToken } from '../../../../../src/middleware/session-guard.js'

export async function POST(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const resolvedParams = await params
    const studentId = String(payload.sub)
    const attemptId = String(resolvedParams.id)
    
    // Get request body (answers from frontend)
    let body = {}
    try { body = await request.json() } catch {}
    const { answers = [] } = body  // Array of { itemId, type, value }
    
    // Allow empty answers for timeout auto-submit (grade as 0)
    if (!Array.isArray(answers)) {
      return sendError('Answers must be an array', 400)
    }
    
    // Verify attempt belongs to student
    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, studentId },
      include: {
        package: {
          include: {
            category: { select: { name: true } },
            pages: { include: { questions: true } }
          }
        }
      }
    })
    
    if (!attempt) return sendError('Test attempt not found', 404)
    if (attempt.completedAt) return sendError('Test already submitted', 400)
    
    // Check if package is published
    const draftCheck = await checkPackagePublished(attemptId)
    if (!draftCheck.ok) {
      if (draftCheck.reason === 'package_draft' || draftCheck.reason === 'package_deleted') {
        await cleanupDraftAttempt(attemptId)
        return sendError('Package is unavailable', 409, { code: 'PACKAGE_DRAFT' })
      }
      return sendError('Invalid attempt', 404)
    }
    
    // Check if session exists and not expired
    const activeSession = await prisma.activeTestSession.findFirst({
      where: { attemptId, studentId }
    })
    
    if (!activeSession) {
      return sendError('Session not found', 403, { reason: 'session_not_found' })
    }
    
    const now = new Date()
    const isExpired = activeSession.expiresAt && new Date(activeSession.expiresAt) < now

    // Optional: Validate session token if provided (skip for expired sessions to allow timeout auto-submit)
    const sessionToken = request.headers.get('x-session-token')
    if (sessionToken && !isExpired) {
      const isValid = await validateSessionToken(attemptId, sessionToken, studentId)
      if (!isValid) return sendError('Invalid session token', 403, { reason: 'invalid_token' })
    }
    
    // Get all questions from package
    const items = attempt.package.pages.flatMap(p => p.questions)
    // Count total questions PER BLANK for SHORT_ANSWER & MATCHING_DROPDOWN (aligns with GET route)
    let totalQuestions = 0
    for (const it of items) {
      if (it.type === 'SHORT_ANSWER' || it.type === 'MATCHING_DROPDOWN') {
        const blanks = (String(it.question || '').match(/\[[^\]]*\]/g) || []).length || 1
        totalQuestions += blanks
      } else {
        totalQuestions += 1
      }
    }
    
    // Grade answers (per-blank for SHORT_ANSWER & MATCHING_DROPDOWN)
    const { correctCount } = gradeAnswers(answers, items)
    
    // Calculate percentage score and store as integer (0–100)
    const percentageScore = Math.round(calculateScore(correctCount, totalQuestions))
    
    // Transaction: Update attempt, record history, cleanup, update record
    const result = await prisma.$transaction(async (tx) => {
      // Snapshot data from package/category
      const packageTitle = attempt.package?.title || null
      const categoryName = attempt.package?.category?.name || null
      
      // Update attempt with final scores and snapshot
      // Use expiresAt if session was expired (timeout), otherwise use current time
      const completedAt = isExpired ? activeSession.expiresAt : now
      const updated = await tx.testAttempt.update({
        where: { id: attemptId },
        data: {
          completedAt,
          totalScore: percentageScore,
          packageTitle,
          categoryName
        }
      })
      
      // Session data used for record update
      const sessionData = await tx.activeTestSession.findFirst({
        where: { attemptId },
        select: {
          recordId: true,
          packageId: true,
          categoryId: true,
          turnNumber: true
        }
      })
      // Fairness history removed
      
      // Cleanup session and temporary answers
      await cleanupAfterSubmit(attemptId, tx)
      
      // Update TestRecord if this is part of a multi-category test
      let recordUpdated = false
      if (sessionData?.recordId) {
        try {
          await updateRecordAverageScore(sessionData.recordId, tx)
          recordUpdated = true
        } catch (err) {
          console.error('Failed to update record average:', err)
        }
      }
      
      return {
        updated,
        recordId: sessionData?.recordId,
        categoryId: sessionData?.categoryId || attempt.package?.categoryId,
        recordUpdated
      }
    })

    return sendSuccess({
      attempt: {
        id: result.updated.id,
        completedAt: result.updated.completedAt,
        totalScore: result.updated.totalScore
      },
      categoryId: result.categoryId,
      recordId: result.recordId,
      summary: {
        totalQuestions,
        correctAnswers: correctCount,
        percentageScore
      },
      message: 'Test submitted successfully'
    })
    
  } catch (e) {
    console.error('POST /api/test/[id]/submit error:', e)
    return sendError(e.message || 'Failed to submit test', 500)
  }
}

/**
 * Grade student answers against question items
 * @param {Array} answers - Student answers [{itemId, type, value}]
 * @param {Array} items - Question items from database
 * @returns {{correctCount: number, totalScore: number}}
 */
function gradeAnswers(answers, items) {
  let correctCount = 0
  
  for (const item of items) {
    const studentAnswer = answers.find(a => a.itemId === item.id)
    if (!studentAnswer) continue
    
    if (item.type === 'MULTIPLE_CHOICE' || item.type === 'TRUE_FALSE_NOT_GIVEN') {
      const correctKey = String(item.correctKey || '').trim()
      const studentValue = String(studentAnswer.value || '').trim()
      if (correctKey === studentValue) correctCount += 1
      continue
    }

    if (item.type === 'SHORT_ANSWER' || item.type === 'MATCHING_DROPDOWN') {
      // Normalize helper: lowercase, remove diacritics/punct, collapse spaces
      const norm = (s) => String(s ?? '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      const rawCorrect = item.answerText
      const correctSlots = Array.isArray(rawCorrect)
        ? rawCorrect.map(slot => Array.isArray(slot) ? slot.map(norm) : [norm(slot)])
        : [[norm(rawCorrect)]]

      const studentSlotsRaw = Array.isArray(studentAnswer.value) ? studentAnswer.value : [studentAnswer.value]
      const studentSlots = studentSlotsRaw.map(norm)

      // Per-blank grading: add 1 for each blank answered with an acceptable value
      for (let i = 0; i < correctSlots.length; i++) {
        const acceptable = correctSlots[i]
        const studentVal = studentSlots[i] || ''
        const ok = acceptable.some(acc => acc === studentVal)
        if (ok) correctCount += 1
      }
      continue
    }
  }
  
  return { correctCount }
}

/**
 * Check if student answer is correct
 * @param {object} studentAnswer - {itemId, type, value}
 * @param {object} item - Question item from database
 * @returns {boolean}
 */
// removed unused checkAnswer helper (grading now handled in gradeAnswers)

export function OPTIONS() { return new Response(null, { status: 204 }) }
