import { requireAuth } from '../../../src/middleware/require-auth.js'
import prisma from '../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../src/utils/http.js'
import { isLocal } from '../../../src/lib/storage.js'
import { deleteR2Object } from '../../../src/lib/storage-r2.js'
import { join } from 'path'
import { unlink } from 'fs/promises'
import { transformQuestionsToDraft, computeContentHash } from '../../../src/utils/questionTransformers.js'

export async function POST(request) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) }, select: { id: true, role: true } })
    if (!user) return sendError('User not found', 401)
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return sendError('Access denied. Tutor role required.', 403)
    }

    let body
    try { body = await request.json() } catch {
      return sendError('Invalid JSON body', 400)
    }

    const pagesPayload = Array.isArray(body?.pages) ? body.pages : []
    const duration = Number(body?.quizDuration || 0)
    const totalQuestionsFromFE = Number(body?.totalQuestions || 0)
    const status = String(body?.meta?.status || 'draft').toUpperCase()
    const packageId = body?.meta?.packageId ? String(body.meta.packageId) : null

    // packageId is now required
    if (!packageId) {
      return sendError('packageId is required', 400)
    }

    // Count questions for validation
    let questionsCount = 0
    for (const page of pagesPayload) {
      const questions = Array.isArray(page?.questions) ? page.questions : []
      questionsCount += questions.length
    }


    // Validate: PUBLISHED requires questions and duration
    if (status === 'PUBLISHED') {
      if (questionsCount === 0) {
        return sendError('Tidak dapat publish package tanpa pertanyaan. Silakan tambahkan pertanyaan terlebih dahulu.', 400)
      }
      if (!Number.isInteger(duration) || duration <= 0) {
        return sendError('Duration harus diisi untuk publish package.', 400)
      }
    }

    const pkg = await prisma.questionPackage.findFirst({ where: { id: packageId } })
    if (!pkg) return sendError('QuestionPackage not found', 404)

    // CONDITIONAL CHECK-ONLY PATH: allow clients to perform a lightweight check without sending full pages
    if (body?.checkOnly === true) {
      const incomingHash = typeof body?.contentHash === 'string' ? body.contentHash : null
      if (!incomingHash) return sendError('contentHash is required for checkOnly', 400)
      // Load current saved pages to compute server hash
      const currentPages = await prisma.questionPage.findMany({
        where: { packageId },
        orderBy: { pageOrder: 'asc' },
        include: {
          mediaAssets: true,
          questions: {
            orderBy: { itemOrder: 'asc' },
            include: { mediaAssets: true }
          }
        }
      })
      const serverHash = computeContentHash(currentPages)
      const desiredStatus = status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
      const metaSame = (
        (pkg.durationMinutes || 0) === (duration || 0) &&
        (pkg.status || 'DRAFT') === desiredStatus &&
        (pkg.totalQuestions || 0) === (totalQuestionsFromFE || 0)
      )
      const changed = !(serverHash === incomingHash && metaSame)
      return sendSuccess({
        id: packageId,
        changed,
        status: pkg.status || 'DRAFT',
      })
    }

    // EARLY RETURN: If contentHash matches current stored content and metadata unchanged, skip writes
    const incomingHash = typeof body?.contentHash === 'string' ? body.contentHash : null
    if (incomingHash) {
      // Load current saved pages for this package to compute server hash
      const currentPages = await prisma.questionPage.findMany({
        where: { packageId },
        orderBy: { pageOrder: 'asc' },
        include: {
          mediaAssets: true,
          questions: {
            orderBy: { itemOrder: 'asc' },
            include: { mediaAssets: true }
          }
        }
      })
      const serverHash = computeContentHash(currentPages)
      const desiredStatus = status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
      const metaSame = (
        (pkg.durationMinutes || 0) === (duration || 0) &&
        (pkg.status || 'DRAFT') === desiredStatus &&
        (pkg.totalQuestions || 0) === (totalQuestionsFromFE || 0)
      )
      if (serverHash === incomingHash && metaSame) {
        const draftPages = transformQuestionsToDraft(currentPages)
        return sendSuccess({
          id: packageId,
          status: pkg.status || 'DRAFT',
          totalQuestions: pkg.totalQuestions || 0,
          draft: {
            id: packageId,
            pages: draftPages,
            quizDuration: pkg.durationMinutes || 0
          }
        })
      }
    }

    // Update package with duration and status (only now, after hash check)
    const updateData = {
      status: status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    }
    // Only update duration if it's provided (> 0) or if publishing
    if (duration > 0 || status === 'PUBLISHED') {
      updateData.durationMinutes = duration
    }
    await prisma.questionPackage.update({
      where: { id: packageId },
      data: updateData
    })

    // Collect current media storage keys BEFORE replacing, to detect removals
    const prevMedia = await prisma.mediaAsset.findMany({
      where: {
        OR: [
          { page: { packageId } },
          { item: { page: { packageId } } },
        ]
      },
      select: { storageKey: true }
    })

    // Preserve IDs by upserting pages/items and deleting only what is removed
    await prisma.$transaction(async (tx) => {
      // Load existing pages/items for package
      const existingPages = await tx.questionPage.findMany({
        where: { packageId },
        orderBy: { pageOrder: 'asc' },
        include: { questions: { orderBy: { itemOrder: 'asc' } } }
      })

      const pageById = new Map(existingPages.map(p => [p.id, p]))
      const itemsByPageId = new Map(existingPages.map(p => [p.id, new Map(p.questions.map(it => [it.id, it]))]))

      const keptPageIds = new Set()

      for (let i = 0; i < pagesPayload.length; i++) {
        const p = pagesPayload[i] || {}
        const desired = {
          pageOrder: i + 1,
          storyPassage: (p.storyText || p.storyPassage || null),
          instructions: p.instructions || null,
        }
        let pageIdForItems
        if (p.id && pageById.has(p.id)) {
          await tx.questionPage.update({ where: { id: p.id }, data: desired })
          keptPageIds.add(p.id)
          pageIdForItems = p.id
        } else {
          const created = await tx.questionPage.create({ data: { ...desired, packageId } })
          keptPageIds.add(created.id)
          pageIdForItems = created.id
        }

        // Upsert items for this page
        const existingItemMap = itemsByPageId.get(pageIdForItems) || new Map()
        const keptItemIds = new Set()
        const questions = Array.isArray(p.questions) ? p.questions : []
        for (let j = 0; j < questions.length; j++) {
          const q = questions[j] || {}
          const common = {
            pageId: pageIdForItems,
            itemOrder: j + 1,
            question: q.text || q.shortTemplate || q.matchingTemplate || '',
          }
          // Map FE type to DB type fields
          let patch = {}
          if (q.type === 'MCQ') {
            const options = Array.isArray(q.options) ? q.options : []
            const choicesJson = options.map((t, idx) => ({ key: ['A','B','C','D'][idx] || String(idx), text: t }))
            const correctIndex = (typeof q.correctIndex === 'number') ? q.correctIndex : null
            patch = {
              type: 'MULTIPLE_CHOICE',
              choicesJson,
              correctKey: (correctIndex !== null) ? (['A','B','C','D'][correctIndex] || String(correctIndex)) : null,
              answerText: null,
            }
          } else if (q.type === 'TFNG') {
            patch = {
              type: 'TRUE_FALSE_NOT_GIVEN',
              choicesJson: [
                { key: 'T', text: 'True' },
                { key: 'F', text: 'False' },
                { key: 'NG', text: 'Not Given' },
              ],
              correctKey: q.correctTFNG || null,
              answerText: null,
            }
          } else if (q.type === 'SHORT') {
            const tpl = String(q.shortTemplate || q.text || '')
            // Extract all bracket contents as array
            const matches = tpl.match(/\[([^\]]*)\]/g) || []
            const answers = matches.map(m => m.replace(/^\[|\]$/g, '').trim().toLowerCase())
            patch = {
              type: 'SHORT_ANSWER',
              correctKey: null,
              answerText: answers,
            }
            // Ensure saved question uses the template (with brackets)
            common.question = tpl
          } else if (q.type === 'MATCHING') {
            const tpl = String(q.matchingTemplate || q.text || '')
            const matches = tpl.match(/\[([^\]]*)\]/g) || []
            // Store answers as lowercase for consistent matching and preview
            const answers = matches.map(m => m.replace(/^\[|\]$/g, '').trim().toLowerCase())
            // Dropdown options = unique answers from template (keys lowercase; UI can capitalize labels)
            const uniqueAnswers = Array.from(new Set(answers.filter(a => a.length > 0)))
            const choicesJson = uniqueAnswers.map(text => ({ text }))

            patch = {
              type: 'MATCHING_DROPDOWN',
              choicesJson,
              correctKey: null,
              answerText: answers,
            }
            common.question = tpl
          }

          if (q.id && existingItemMap.has(q.id)) {
            await tx.questionItem.update({ where: { id: q.id }, data: { ...common, ...patch } })
            keptItemIds.add(q.id)
          } else {
            const createdItem = await tx.questionItem.create({ data: { ...common, ...patch } })
            keptItemIds.add(createdItem.id)
          }
        }

        // Delete items no longer present for this page
        if (existingItemMap.size) {
          const toDeleteItemIds = Array.from(existingItemMap.keys()).filter(id => !keptItemIds.has(id))
          if (toDeleteItemIds.length) {
            await tx.mediaAsset.deleteMany({ where: { itemId: { in: toDeleteItemIds } } })
            await tx.questionItem.deleteMany({ where: { id: { in: toDeleteItemIds } } })
          }
        }
      }

      // Delete pages no longer present (and their items/media)
      if (existingPages.length) {
        const toDeletePageIds = existingPages.map(p => p.id).filter(id => !keptPageIds.has(id))
        if (toDeletePageIds.length) {
          await tx.mediaAsset.deleteMany({ where: { OR: [ { pageId: { in: toDeletePageIds } }, { item: { pageId: { in: toDeletePageIds } } } ] } })
          await tx.questionItem.deleteMany({ where: { pageId: { in: toDeletePageIds } } })
          await tx.questionPage.deleteMany({ where: { id: { in: toDeletePageIds } } })
        }
      }
    })

    // Collect media AFTER replace to find which files were removed from DB
    const curMedia = await prisma.mediaAsset.findMany({
      where: {
        OR: [
          { page: { packageId } },
          { item: { page: { packageId } } },
        ]
      },
      select: { storageKey: true }
    })

    // Compute deleted storage keys
    const curSet = new Set(curMedia.map(m => m.storageKey).filter(Boolean))
    const toDelete = prevMedia
      .map(m => m.storageKey)
      .filter(k => k && !curSet.has(k))

    // Best-effort unlink
    for (const key of toDelete) {
      try {
        if (isLocal()) {
          await unlink(join(process.cwd(), 'uploads', key))
        } else {
          await deleteR2Object(key)
        }
      } catch (e) {
        console.warn('Could not delete removed media file:', key, e.message)
      }
    }

    // Update totalQuestions from FE (FE already calculated with SHORT blanks logic)
    await prisma.questionPackage.update({
      where: { id: packageId },
      data: { totalQuestions: totalQuestionsFromFE }
    })

    // Reload saved data to return to frontend (for state sync)
    const updatedPkg = await prisma.questionPackage.findFirst({ 
      where: { id: packageId },
      select: { id: true, durationMinutes: true, status: true, totalQuestions: true }
    })
    
    const savedPages = await prisma.questionPage.findMany({
      where: { packageId },
      orderBy: { pageOrder: 'asc' },
      include: { 
        mediaAssets: true,
        questions: { 
          orderBy: { itemOrder: 'asc' },
          include: { mediaAssets: true }
        }
      }
    })

    // Transform to same format as GET /draft endpoint for state sync
    const draftPages = transformQuestionsToDraft(savedPages)

    return sendSuccess({ 
      id: packageId, 
      status: updatedPkg?.status || 'DRAFT',
      totalQuestions: totalQuestionsFromFE,
      draft: {
        id: packageId,
        pages: draftPages,
        quizDuration: updatedPkg?.durationMinutes || 0
      }
    })
  } catch (error) {
    console.error('POST /api/questions error:', error)
    return sendError('Failed to save questions', 500)
  }
}
