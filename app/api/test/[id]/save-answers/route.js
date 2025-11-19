import prisma from '../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../src/utils/http.js'
import { validateSessionToken, updateSessionActivity } from '../../../../../src/middleware/session-guard.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'
import { checkPackagePublished, cleanupDraftAttempt } from '../../../../../src/utils/draft-guard.js'

export async function POST(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth
    const studentId = String(payload.sub)
    
    const resolvedParams = await params
    const attemptId = resolvedParams.id
    if (!attemptId) return sendError('Attempt ID required', 400)
    
    let body = {}
    try { body = await request.json() } catch {}
    
    const { answers, audioCounts = {}, currentPageIndex = 0, meta = null } = body
    
    // Check if package is published
    const draftCheck = await checkPackagePublished(attemptId)
    if (!draftCheck.ok) {
      if (draftCheck.reason === 'package_draft' || draftCheck.reason === 'package_deleted') {
        await cleanupDraftAttempt(attemptId)
        return sendError('Package is unavailable', 409, { code: 'PACKAGE_DRAFT' })
      }
      return sendError('Test attempt not found', 404)
    }
    
    // Verify attempt belongs to student
    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, studentId }
    })
    
    if (!attempt) return sendError('Test attempt not found', 404)
    if (attempt.completedAt) return sendError('Test already completed', 400)
    
    // Check if session exists and not expired
    const activeSess = await prisma.activeTestSession.findFirst({
      where: { attemptId, studentId }
    })
    
    if (!activeSess) {
      return sendError('Session not found', 403, { reason: 'session_not_found' })
    }
    
    const now = new Date()
    const isExpired = activeSess.expiresAt && new Date(activeSess.expiresAt) < now
    
    // Verify session token (skip for expired sessions)
    const sessionToken = request.headers.get('x-session-token')
    if (sessionToken && !isExpired) {
      const isValid = await validateSessionToken(attemptId, sessionToken, studentId)
      if (!isValid) return sendError('Invalid session token', 403, { reason: 'invalid_token' })
    }
    
    // Allow save even if expired (for edge cases), but skip actual save since it's pointless
    if (isExpired) {
      return sendSuccess({ 
        saved: false, 
        reason: 'session_expired',
        message: 'Session expired, answers not saved (will be graded on submit)'
      })
    }
    
    // Batch upsert temporary answers (only if provided)
    if (Array.isArray(answers) && answers.length > 0) {
      await prisma.$transaction(
        answers.map(ans => {
          // Determine answer format based on type
          const isChoice = ans.type === 'MULTIPLE_CHOICE' || ans.type === 'TRUE_FALSE_NOT_GIVEN'
          const selectedKey = isChoice ? String(ans.value || '') : null

          // SHORT_ANSWER expects an array of strings; normalize safely
          let textAnswer = null
          if (ans.type === 'SHORT_ANSWER') {
            if (Array.isArray(ans.value)) {
              textAnswer = ans.value.map(v => String(v ?? '').trim().toLowerCase())
            } else if (ans.value == null) {
              textAnswer = []
            } else {
              // Backward-compat: single string -> single-element array
              textAnswer = [String(ans.value || '').trim().toLowerCase()]
            }
          }

          // Get audio play count from audioCounts or answer object
          const audioPlayCount = ans.audioPlayCount || audioCounts[ans.itemId] || 0

          return prisma.temporaryAnswer.upsert({
            where: {
              attemptId_itemId: {
                attemptId,
                itemId: ans.itemId
              }
            },
            create: {
              attemptId,
              itemId: ans.itemId,
              selectedKey,
              textAnswer,
              audioPlayCount: Math.min(audioPlayCount, 2), // Backend enforcement: max 2 plays
            },
            update: {
              selectedKey,
              textAnswer,
              audioPlayCount: Math.min(audioPlayCount, 2),
            }
          })
        })
      )
    }

    // Also upsert audio play counts for question-level keys present in audioCounts
    // This allows audio-only updates to persist without answers payload
    const questionKeys = Object.keys(audioCounts || {}).filter(k => typeof k === 'string' && !k.startsWith('page:'))
    if (questionKeys.length > 0) {
      await prisma.$transaction(
        questionKeys.map(itemId => {
          const cnt = Math.min(Number(audioCounts[itemId] || 0), 2)
          return prisma.temporaryAnswer.upsert({
            where: { attemptId_itemId: { attemptId, itemId } },
            create: { attemptId, itemId, audioPlayCount: cnt },
            update: { audioPlayCount: cnt }
          })
        })
      )
    }
    
    // Update session activity and save current page index + meta
    await updateSessionActivity(attemptId)
    
    // Save current page index and meta to session metadata (for cross-browser resume)
    // Merge page-level audio counts into metadata.audioCountsMap
    // Load current metadata
    const activeSession = await prisma.activeTestSession.findFirst({ where: { attemptId } })
    const existingMeta = (activeSession && activeSession.metadata) ? activeSession.metadata : {}
    const existingCounts = existingMeta.audioCountsMap && typeof existingMeta.audioCountsMap === 'object'
      ? existingMeta.audioCountsMap
      : {}
    const nextCounts = { ...existingCounts }
    for (const [key, val] of Object.entries(audioCounts || {})) {
      if (typeof key === 'string' && key.startsWith('page:')) {
        const incoming = Math.min(Number(val || 0), 2)
        const prev = Math.min(Number(existingCounts[key] || 0), 2)
        nextCounts[key] = Math.max(prev, incoming)
      }
    }
    const metadataToSave = {
      ...existingMeta,
      audioCountsMap: nextCounts,
      currentPageIndex,
      lastSyncAt: new Date().toISOString()
    }
    
    // Include meta if provided (for cross-browser support)
    if (meta && typeof meta === 'object') {
      metadataToSave.testMeta = meta
    }
    
    await prisma.activeTestSession.updateMany({
      where: { attemptId },
      data: {
        metadata: metadataToSave
      }
    })
    
    return sendSuccess({ 
      saved: Array.isArray(answers) ? answers.length : 0,
      timestamp: new Date().toISOString(),
      currentPageIndex
    })
    
  } catch (e) {
    console.error('POST /api/test/[attemptId]/save-answers error:', e)
    return sendError('Failed to save answers', 500)
  }
}
