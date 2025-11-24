import prisma from '../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../src/utils/http.js'
import { generateSessionToken, getActiveSession } from '../../../../src/middleware/session-guard.js'
import { requireAuthAndSession } from '../../../../src/middleware/require-auth.js'
import { autoSubmitExpiredSession } from '../../../../src/utils/session-cleanup.js'
import { gradeAttempt } from '../../../../src/utils/grade-attempt.js'

// POST /api/test/start
// Body: { packageId: string, categoryId: string, turnNumber: number, recordId?: string }
export async function POST(request) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const studentId = String(payload.sub)
    let body = {}
    try { body = await request.json() } catch {}
    
    const packageId = body?.packageId ? String(body.packageId) : null
    const categoryId = body?.categoryId ? String(body.categoryId) : null
    const turnNumber = body?.turnNumber ? Number(body.turnNumber) : 1
    const recordIdInput = body?.recordId ? String(body.recordId) : null
    // Cross-browser support: accept meta from frontend
    const preparedCategories = Array.isArray(body?.preparedCategories) ? body.preparedCategories : []
    const testMeta = body?.testMeta || null
    
    if (!packageId) return sendError('packageId is required', 400)
    if (!categoryId) return sendError('categoryId is required', 400)

    // Check if student already has an active session
    const { hasSession, session } = await getActiveSession(studentId)
    if (hasSession) {
      const now = new Date()
      
      // Check if session is expired
      if (session.expiresAt && new Date(session.expiresAt) < now) {
        // Auto-submit with grading before cleanup
        try {
          await autoSubmitExpiredSession(session.attemptId, session, async (attemptId, tx) => {
            const res = await gradeAttempt(attemptId, tx)
            return { totalScore: res.totalScore }
          })
        } catch (e) {
          console.error('Failed to auto-submit expired session on start:', e)
          // Fallback: cleanup without grading
          // await prisma.activeTestSession.deleteMany({ where: { studentId } })
          // await prisma.temporaryAnswer.deleteMany({ where: { attemptId: session.attemptId } })
        }
      } else {
        // Check if attempt is actually incomplete
        const attempt = await prisma.testAttempt.findUnique({
          where: { id: session.attemptId },
          select: { id: true, completedAt: true }
        })
        
        if (attempt && attempt.completedAt) {
          // Attempt completed but session not cleaned up - auto cleanup
          await prisma.activeTestSession.deleteMany({ where: { studentId } })
          await prisma.temporaryAnswer.deleteMany({ 
            where: { attemptId: session.attemptId }
          })
        } else if (attempt) {
          // Session valid and attempt incomplete - redirect
          return sendError('You already have an active test session', 403, {
            activeAttemptId: session.attemptId,
            categoryName: session.categoryName,
            redirectTo: `/test/${session.attemptId}`
          })
        } else {
          // Attempt not found - cleanup orphaned session
          await prisma.activeTestSession.deleteMany({ where: { studentId } })
        }
      }
    }

    // Verify category exists
    const category = await prisma.questionCategory.findUnique({
      where: { id: categoryId },
      select: { name: true }
    })
    if (!category) return sendError('Category not found', 404)
    
    // Verify package exists and is published
    const pkg = await prisma.questionPackage.findFirst({
      where: { id: packageId, status: 'PUBLISHED' }
    })
    if (!pkg) return sendError('Package not found or not published', 404)

    // GET OR CREATE TEST RECORD
    let testRecord = null
    if (recordIdInput) {
      testRecord = await prisma.testRecord.findFirst({
        where: { id: recordIdInput, studentId }
      })
    }
    // If not provided or not found, try to reuse an ACTIVE record (has incomplete attempts)
    if (!testRecord) {
      const activeRecord = await prisma.testRecord.findFirst({
        where: { studentId, attempts: { some: { completedAt: null } } },
        orderBy: { createdAt: 'desc' }
      })
      if (activeRecord) {
        testRecord = activeRecord
      }
    }
    // If still none, fallback to latest record for this student
    if (!testRecord) {
      const latestRecord = await prisma.testRecord.findFirst({
        where: { studentId },
        orderBy: { createdAt: 'desc' }
      })
      if (latestRecord) {
        testRecord = latestRecord
      }
    }
    // If still none, create a new record now (first-time scenario)
    if (!testRecord) {
      testRecord = await prisma.testRecord.create({ data: { studentId } })
    }
    // IDEMPOTENT BEHAVIOR: Reuse existing incomplete attempt for (recordId, categoryId)
    const existingAttempt = await prisma.testAttempt.findFirst({
      where: {
        recordId: testRecord.id,
        studentId,
        package: { categoryId }
      },
      select: { id: true, completedAt: true, packageId: true }
    })

    // If attempt exists for this category within the record
    if (existingAttempt) {
      if (existingAttempt.completedAt) {
        // Only allow retake if the current record has NO incomplete attempts
        const incompleteCount = await prisma.testAttempt.count({
          where: { recordId: testRecord.id, studentId, completedAt: null }
        })
        if (incompleteCount === 0) {
          // Record fully completed → create a NEW TestRecord for retake
          testRecord = await prisma.testRecord.create({ data: { studentId } })
          // Continue below to create a fresh attempt in the new record
        } else {
          // There are still incomplete attempts in this record → block retake for this category
          return sendError('Category already completed in this test record', 409, {
            recordId: testRecord.id,
            categoryId,
            attemptId: existingAttempt.id
          })
        }
      } else {
        // Attempt is incomplete → Reuse attempt and (re)create an active session
        const pkgForExisting = await prisma.questionPackage.findFirst({
          where: { id: existingAttempt.packageId, status: 'PUBLISHED' }
        })
        if (!pkgForExisting) return sendError('Package not found or not published', 404)

        const sessionTokenReuse = generateSessionToken()
        const expiresAtReuse = new Date(Date.now() + pkgForExisting.durationMinutes * 60 * 1000)

        await prisma.$transaction(async (tx) => {
          // Cleanup any previous active session for this student
          await tx.activeTestSession.deleteMany({ where: { studentId } })
          // Create a fresh active session bound to the existing attempt
          await tx.activeTestSession.create({
            data: {
              studentId,
              attemptId: existingAttempt.id,
              sessionToken: sessionTokenReuse,
              recordId: testRecord.id,
              categoryId,
              categoryName: category.name,
              packageId: existingAttempt.packageId,
              turnNumber,
              expiresAt: expiresAtReuse
            }
          })
        })

        return sendSuccess({
          attempt: {
            id: existingAttempt.id,
            sessionToken: sessionTokenReuse,
            recordId: testRecord.id
          }
        })
      }
    }

    // Create new attempt and session in transaction
    const sessionToken = generateSessionToken()
    const expiresAt = new Date(Date.now() + pkg.durationMinutes * 60 * 1000)

    let result
    try {
      result = await prisma.$transaction(async (tx) => {
        // Delete any existing active session (cleanup orphaned sessions)
        await tx.activeTestSession.deleteMany({ where: { studentId } })
        
        // Create attempt linked to TestRecord with snapshot fields
        const attempt = await tx.testAttempt.create({
          data: {
            packageId: packageId,
            studentId,
            recordId: testRecord.id,
            packageTitle: pkg.title,
            categoryName: category.name
          }
        })

        // NOTE: StudentPackageHistory will be created in submit route
        // This ensures turn number is only recorded after successful test completion
        // Store packageId and turnNumber in ActiveTestSession for later use

        // Build metadata with testMeta for cross-browser support
        const metadata = {}
        if (testMeta && typeof testMeta === 'object') {
          metadata.testMeta = testMeta
        } else if (preparedCategories.length > 0) {
          // Reconstruct testMeta from preparedCategories
          const categoryIds = preparedCategories.map(pc => pc.categoryId)
          const categoryNames = Object.fromEntries(
            preparedCategories.map(pc => [pc.categoryId, pc.categoryName])
          )
          metadata.testMeta = {
            categoryIds,
            completedCategoryIds: [],
            recordId: testRecord.id,
            preparedCategories,
            categoryNames,
            mode: categoryIds.length > 1 ? 'multiple' : 'single'
          }
        }

        // Create active session with package info and record tracking
        await tx.activeTestSession.create({
          data: {
            studentId,
            attemptId: attempt.id,
            sessionToken,
            recordId: testRecord.id,
            categoryId,
            categoryName: category.name,
            packageId,
            turnNumber,
            expiresAt,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined
          }
        })

        return attempt
      })
    } catch (err) {
      // Handle race conditions/double-clicks causing unique constraint on studentId
      const code = err?.code || err?.meta?.code
      if (code === 'P2002') {
        const { hasSession, session } = await getActiveSession(studentId)
        if (hasSession && session?.attemptId) {
          return sendError('You already have an active test session', 403, {
            activeAttemptId: session.attemptId,
            categoryName: session.categoryName,
            redirectTo: `/test/${session.attemptId}`
          })
        }
      }
      throw err
    }

    return sendSuccess({ 
      attempt: { 
        id: result.id,
        sessionToken,
        recordId: testRecord.id
      } 
    })
  } catch (e) {
    console.error('POST /api/test/start error:', e)
    return sendError('Failed to start test', 500)
  }
}

export function OPTIONS() { return new Response(null, { status: 204 }) }
