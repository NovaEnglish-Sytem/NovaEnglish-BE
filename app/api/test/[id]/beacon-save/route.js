import prisma from '../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'

export async function POST(request, { params }) {
  try {
    // Authenticate quickly (sendBeacon path)
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth
    const studentId = String(payload.sub)
    
    const resolvedParams = await params
    const attemptId = resolvedParams.id
    if (!attemptId) return sendError('Attempt ID required', 400)
    
    let body = {}
    try { body = await request.json() } catch (e) {
      return sendError('Invalid request body', 400)
    }
    
    const { answers, audioCounts = {}, currentPageIndex = 0, meta = null } = body
    
    // Quick verify (no heavy queries)
    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, studentId },
      select: { id: true, completedAt: true }
    })
    
    if (!attempt || attempt.completedAt) {
      return sendSuccess({ saved: 0, message: 'Test already completed or not found' })
    }
    
    // Fast batch insert/update to TemporaryAnswer (aligned with save-answers semantics)
    if (Array.isArray(answers) && answers.length > 0) {
      await prisma.$transaction(
        answers.map(ans => {
          const selectedKey = 
            ans.type === 'MULTIPLE_CHOICE' || ans.type === 'TRUE_FALSE_NOT_GIVEN'
              ? String(ans.value || '')
              : null

          // SHORT_ANSWER & MATCHING_DROPDOWN expect an array of strings; normalize safely
          let textAnswer = null
          if (ans.type === 'SHORT_ANSWER' || ans.type === 'MATCHING_DROPDOWN') {
            if (Array.isArray(ans.value)) {
              textAnswer = ans.value.map(v => String(v ?? '').trim().toLowerCase())
            } else if (ans.value == null) {
              textAnswer = []
            } else {
              // Backward-compat: single string -> single-element array
              textAnswer = [String(ans.value || '').trim().toLowerCase()]
            }
          } else if (ans.value == null) {
            textAnswer = []
          } else {
            textAnswer = [String(ans.value || '').trim().toLowerCase()]
          }

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
              audioPlayCount: Math.min(audioPlayCount, 2),
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

    // Also upsert audio play counts for question-level keys present in audioCounts (audio-only updates)
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

    // Merge page-level counts into ActiveTestSession.metadata.audioCountsMap and persist page index + meta
    const activeSession = await prisma.activeTestSession.findFirst({ where: { attemptId } })
    const existingMeta = (activeSession && activeSession.metadata) ? activeSession.metadata : {}
    const existingCounts = existingMeta.audioCountsMap && typeof existingMeta.audioCountsMap === 'object' ? existingMeta.audioCountsMap : {}
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
      data: { metadata: metadataToSave }
    })
    
    return sendSuccess({ 
      saved: Array.isArray(answers) ? answers.length : 0,
      beacon: true,
    })
    
  } catch (e) {
    console.error('POST /api/test/[attemptId]/beacon-save error:', e)
    // Don't fail the request, just log
    return sendSuccess({ 
      saved: 0, 
      error: e.message,
      message: 'Partial save may have occurred'
    })
  }
}
