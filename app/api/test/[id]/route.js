import prisma from '../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../src/utils/http.js'
import { validateSessionToken, updateSessionActivity, getActiveSession } from '../../../../src/middleware/session-guard.js'
import { requireAuthAndSession } from '../../../../src/middleware/require-auth.js'
import { checkPackagePublished, cleanupDraftAttempt } from '../../../../src/utils/draft-guard.js'
import { autoSubmitExpiredSession } from '../../../../src/utils/session-cleanup.js'
import { gradeAttempt } from '../../../../src/utils/grade-attempt.js'

export async function GET(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    // Next.js 15: await params before accessing properties
    const resolvedParams = await params
    const studentId = String(payload.sub)
    const attemptId = String(resolvedParams.id)

    // Check if student has active session for this attempt
    const { hasSession, session } = await getActiveSession(studentId)
    
    if (!hasSession) {
      return sendError('No active test session found', 403, {
        reason: 'session_not_found'
      })
    }
    
    // Check if session expired
    const now = new Date()
    if (session.expiresAt && new Date(session.expiresAt) < now) {
      // Auto-submit with grading when session is expired
      try {
        await autoSubmitExpiredSession(session.attemptId, session, async (attemptId, tx) => {
          const res = await gradeAttempt(attemptId, tx)
          return { totalScore: res.totalScore }
        })
      } catch (e) {
        console.error('Failed to auto-submit expired session:', e)
      }
      return sendError('Test session has expired', 403, {
        reason: 'session_expired'
      })
    }
    
    // If accessing wrong attempt, redirect to active test
    if (session.attemptId !== attemptId) {
      return sendError('Another test is in progress', 403, {
        activeAttemptId: session.attemptId,
        reason: 'wrong_attempt'
      })
    }

    // Validate session token if provided
    const sessionToken = request.headers.get('x-session-token')
    if (sessionToken) {
      const isValid = await validateSessionToken(attemptId, sessionToken, studentId)
      if (!isValid) return sendError('Invalid session token', 403, { reason: 'invalid_token' })
    }

    // Check if package is published
    const draftCheck = await checkPackagePublished(attemptId)
    if (!draftCheck.ok) {
      if (draftCheck.reason === 'package_draft' || draftCheck.reason === 'package_deleted') {
        await cleanupDraftAttempt(attemptId)
        return sendError('Package is unavailable', 409, { code: 'PACKAGE_DRAFT' })
      }
      return sendError('Attempt not found', 404)
    }

    // Fetch attempt with full package data
    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, studentId },
      include: {
        package: {
          include: {
            category: { select: { id: true, name: true } },
            pages: {
              include: {
                mediaAssets: true,
                questions: {
                  include: { mediaAssets: true },
                  orderBy: { itemOrder: 'asc' }
                }
              },
              orderBy: { pageOrder: 'asc' }
            }
          }
        },
      }
    })
    
    if (!attempt) return sendError('Attempt not found', 404)
    
    // Prevent access to completed tests
    if (attempt.completedAt) {
      return sendError('Test already completed', 403)
    }

    // Update session activity
    await updateSessionActivity(attemptId)

    const pages = attempt.package?.pages || []
    const totalPages = pages.length
    
    // Calculate total questions (SHORT_ANSWER & MATCHING_DROPDOWN count blanks)
    let totalQuestions = 0
    for (const page of pages) {
      for (const qi of page.questions) {
        if (qi.type === 'SHORT_ANSWER' || qi.type === 'MATCHING_DROPDOWN') {
          const matches = (qi.question || '').match(/\[[^\]]*\]/g) || []
          totalQuestions += Math.max(1, matches.length)
        } else {
          totalQuestions += 1
        }
      }
    }

    const categoryName = attempt.package?.category?.name || 'Test'

    // Transform question item to frontend format
    const transformQuestion = (item) => {
      // Parse choices from JSON (for MCQ, TFNG, MATCHING_DROPDOWN, etc.)
      let choices = []
      if (item.choicesJson) {
        try {
          const choicesObj = typeof item.choicesJson === 'string' 
            ? JSON.parse(item.choicesJson) 
            : item.choicesJson
          
          // Convert object to array format
          if (typeof choicesObj === 'object' && !Array.isArray(choicesObj)) {
            choices = Object.entries(choicesObj).map(([key, label]) => ({ key, label }))
          } else if (Array.isArray(choicesObj)) {
            choices = choicesObj
          }
        } catch (e) {
          choices = []
        }
      }

      // Resolve media from mediaAssets
      let mediaUrl = null
      let mediaType = null
      let imageUrl = null
      let audioUrl = null
      try {
        const assets = Array.isArray(item.mediaAssets) ? item.mediaAssets : []
        const audio = assets.find(a => String(a.type).toUpperCase() === 'AUDIO')
        const image = assets.find(a => String(a.type).toUpperCase() === 'IMAGE')

        // Expose both media types independently
        imageUrl = image?.url || null
        audioUrl = audio?.url || null

        // Backward-compatible single mediaUrl/mediaType (prefer AUDIO when present)
        const chosen = audio || image || null
        mediaUrl = chosen?.url || null
        mediaType = chosen?.type || null
      } catch (_) {}

      const prompt = item.question || ''
      const base = {
        id: item.id,
        type: item.type,
        promptHtml: prompt,
        choices,
        mediaUrl,
        mediaType,
        media: {
          imageUrl,
          audioUrl,
        },
      }

      if (item.type === 'SHORT_ANSWER') {
        return {
          ...base,
          shortTemplate: item.question || '',
        }
      }

      if (item.type === 'MATCHING_DROPDOWN') {
        return {
          ...base,
          matchingTemplate: item.question || '',
        }
      }

      return base
    }

    // Return all pages - frontend handles pagination
    const allPagesData = pages.map(page => ({
      id: page.id,
      storyPassage: page.storyPassage || '',
      instructions: page.instructions || '',
      pageMedia: Array.isArray(page.mediaAssets) ? page.mediaAssets.map(a => ({ type: a.type, url: a.url })) : [],
      questions: (page.questions || []).map(transformQuestion)
    }))
    
    // Duration remaining based on ActiveTestSession.expiresAt (more accurate)
    const nowTime = Date.now()
    const expiresAt = session.expiresAt ? new Date(session.expiresAt).getTime() : 0
    
    // Calculate remaining time
    let remainingSeconds = 0
    if (expiresAt > nowTime) {
      remainingSeconds = Math.floor((expiresAt - nowTime) / 1000)
    } else {
      // Fallback: calculate from attempt start time
      const startedAt = new Date(attempt.startedAt).getTime()
      const durationMs = (attempt.package?.durationMinutes || 60) * 60 * 1000
      const remainingMs = Math.max(0, startedAt + durationMs - nowTime)
      remainingSeconds = Math.floor(remainingMs / 1000)
    }
    
    // Restore saved progress from database (for device switching/reconnect)
    const savedAnswers = await prisma.temporaryAnswer.findMany({
      where: { attemptId },
      select: {
        itemId: true,
        selectedKey: true,
        textAnswer: true,
        audioPlayCount: true
      }
    })
    
    // Transform saved answers to frontend format
    const restoredAnswers = {}
    const restoredAudioCounts = {}
    
    for (const saved of savedAnswers) {
      const hasSelection = !!saved.selectedKey
      if (hasSelection) {
        restoredAnswers[saved.itemId] = { type: 'MULTIPLE_CHOICE', value: saved.selectedKey }
      } else {
        const arr = Array.isArray(saved.textAnswer)
          ? saved.textAnswer
          : (saved.textAnswer == null ? [] : [String(saved.textAnswer)])
        restoredAnswers[saved.itemId] = { type: 'SHORT_ANSWER', value: arr }
      }
      
      if (saved.audioPlayCount > 0) {
        restoredAudioCounts[saved.itemId] = Math.min(2, saved.audioPlayCount)
      }
    }

    // Merge page-level audio counts from session metadata
    const metaCounts = session.metadata?.audioCountsMap || {}
    if (metaCounts && typeof metaCounts === 'object') {
      for (const [key, val] of Object.entries(metaCounts)) {
        const v = Math.min(2, Number(val || 0))
        if (v > (restoredAudioCounts[key] || 0)) {
          restoredAudioCounts[key] = v
        }
      }
    }
    
    // Get last saved page index from session metadata
    const lastPageIndex = session.metadata?.currentPageIndex ?? 0
    
    // RECONSTRUCT testMeta from database context for cross-browser support
    let testMeta = session.metadata?.testMeta || null
    
    // If no saved meta OR meta is empty, reconstruct from TestRecord
    if (!testMeta || !testMeta.categoryIds || testMeta.categoryIds.length === 0) {
      if (attempt.recordId) {
        try {
          // Get TestRecord with all attempts
          const record = await prisma.testRecord.findUnique({
            where: { id: attempt.recordId },
            include: {
              attempts: {
                include: {
                  package: {
                    include: { category: true }
                  }
                },
                orderBy: { startedAt: 'asc' }
              }
            }
          })
          
          if (record && record.attempts.length > 0) {
            // OPTIMIZED: Use Set for O(1) lookups instead of Array.includes() O(n)
            // This reduces complexity from O(n²) to O(n)
            const categoryIdSet = new Set()
            const completedSet = new Set()
            const categoryNames = {}
            const preparedCategories = []
            
            const currentCatId = attempt.package?.category?.id
            
            for (const att of record.attempts) {
              const catId = att.package?.category?.id
              const catName = att.package?.category?.name
              
              if (catId) {
                categoryIdSet.add(catId)  // O(1) instead of includes() O(n)
                if (catName) categoryNames[catId] = catName
                
                // Mark as completed
                if (att.completedAt) {
                  completedSet.add(catId)
                }
                
                // Build preparedCategories for remaining tests
                if (!att.completedAt && catId !== currentCatId) {
                  preparedCategories.push({
                    categoryId: catId,
                    categoryName: catName || 'Unknown',
                    packageId: att.packageId,
                    turnNumber: 1,
                    totalQuestions: att.package?.totalQuestions || 0,
                    durationMinutes: att.package?.durationMinutes || 60
                  })
                }
              }
            }
            
            // Convert Sets to Arrays
            const categoryIds = Array.from(categoryIdSet)
            const completedCategoryIds = Array.from(completedSet)
            
            // Reconstruct meta
            testMeta = {
              categoryIds,
              completedCategoryIds,
              recordId: attempt.recordId,
              preparedCategories,
              categoryNames,
              mode: categoryIds.length > 1 ? 'multiple' : 'single',
              currentCategoryId: currentCatId || null
            }
          }
        } catch (e) {
          console.error('Failed to reconstruct testMeta:', e)
          // Fall back to saved meta (even if null)
        }
      }
    }

    return sendSuccess({
      attempt: { id: attempt.id },
      category: { 
        name: categoryName,
        id: attempt.package?.category?.id || null  // ✅ Return categoryId
      },
      totalQuestions,
      totalPages,
      durationMinutes: attempt.package.durationMinutes,
      remainingSeconds,
      pages: allPagesData,  // Return all pages
      sessionToken: session.sessionToken,  // For frontend session tracking
      // Restore progress from database
      savedAnswers: restoredAnswers,
      savedAudioCounts: restoredAudioCounts,
      savedPageIndex: lastPageIndex,
      // Cross-browser support: return saved meta
      testMeta
    })
  } catch (e) {
    console.error('GET /api/test/[id] error:', e)
    return sendError('Failed to load test session', 500)
  }
}

export function OPTIONS() { return new Response(null, { status: 204 }) }
