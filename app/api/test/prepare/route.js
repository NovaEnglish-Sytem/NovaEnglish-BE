import prisma from '../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../src/middleware/require-auth.js'

export async function POST(request) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const studentId = String(payload.sub)
    let body = {}
    try { body = await request.json() } catch {}
    
    let categoryIds = Array.isArray(body?.categoryIds) ? body.categoryIds.map(String) : []
    const recordIdInput = body?.recordId ? String(body.recordId) : null
    const createNewRecord = Boolean(body?.createNewRecord)
    
    if (createNewRecord && categoryIds.length === 0) {
      const cats = await prisma.questionCategory.findMany({
        where: { packages: { some: { status: 'PUBLISHED' } } },
        select: { id: true }
      })
      categoryIds = cats.map(c => c.id)
    }
    if (categoryIds.length === 0) return sendError('categoryIds is required', 400)

    // GET OR CREATE TEST RECORD
    let testRecord = null
    if (createNewRecord) {
      // Force create a fresh record for retake flows
      testRecord = await prisma.testRecord.create({ data: { studentId } })
    } else if (recordIdInput) {
      const existing = await prisma.testRecord.findFirst({ where: { id: recordIdInput, studentId } })
      if (existing) testRecord = existing
    } else {
      // Reuse latest record for this student (even if currently no incomplete attempts)
      const latest = await prisma.testRecord.findFirst({
        where: { studentId },
        orderBy: { createdAt: 'desc' }
      })
      if (latest) testRecord = latest
    }

    // Prepare test data for each category (simple random per category among PUBLISHED packages)
    const preparedCategories = []
    const unavailableCategories = []
    
    // If testRecord exists, skip categories already COMPLETED in that record
    // Allow incomplete attempts to be retried
    if (testRecord) {
      const existing = await prisma.testAttempt.findMany({
        where: { 
          recordId: testRecord.id,
          completedAt: { not: null }  // Only block completed attempts
        },
        select: { package: { select: { categoryId: true } } }
      })
      const blocked = new Set(existing.map(e => e.package?.categoryId).filter(Boolean))
      categoryIds = categoryIds.filter(id => !blocked.has(id))
    }

    for (const categoryId of categoryIds) {
      // Get category info
      const category = await prisma.questionCategory.findUnique({
        where: { id: categoryId },
        select: { id: true, name: true }
      })
      
      if (!category) continue

      // Find packages for category (published only)
      const pkgs = await prisma.questionPackage.findMany({
        where: { categoryId, status: 'PUBLISHED' },
        select: { id: true, title: true, durationMinutes: true },
      })
      
      if (pkgs.length === 0) {
        unavailableCategories.push({ categoryId: category.id, categoryName: category.name, reason: 'no_published_packages' })
        continue
      }
      
      const publishedPkgIds = pkgs.map(p => p.id)

      // Simple random package selection (no fairness/rotation)
      const candidates = publishedPkgIds
      const pickedPkgId = candidates[Math.floor(Math.random() * candidates.length)]
      const pickedPkg = pkgs.find(p => p.id === pickedPkgId)
      
      if (!pickedPkg) {
        unavailableCategories.push({ categoryId: category.id, categoryName: category.name, reason: 'package_not_found' })
        continue
      }
      
      // Count total questions per-blank for SHORT_ANSWER (align with test page and scoring)
      const pages = await prisma.questionPage.findMany({
        where: { packageId: pickedPkg.id },
        include: { questions: true },
        orderBy: { pageOrder: 'asc' }
      })
      let totalQuestions = 0
      for (const pg of pages) {
        for (const qi of pg.questions || []) {
          if (qi.type === 'SHORT_ANSWER') {
            const matches = (qi.question || '').match(/\[[^\]]*\]/g) || []
            totalQuestions += Math.max(1, matches.length)
          } else {
            totalQuestions += 1
          }
        }
      }
      
      preparedCategories.push({
        categoryId: category.id,
        categoryName: category.name,
        packageId: pickedPkgId,
        // turnNumber is deprecated; keep null for compatibility
        turnNumber: null,
        totalQuestions,
        durationMinutes: pickedPkg.durationMinutes,
      })
    }

    if (preparedCategories.length === 0) {
      return sendError('This test is not available right now.', 422, {
        unavailableCategories,
        hint: 'Your tutor may have just unpublished the question package. Please try again later or contact your tutor.'
      })
    }

    return sendSuccess({
      recordId: testRecord?.id || null,
      categories: preparedCategories,
      unavailableCategories
    })
  } catch (e) {
    console.error('POST /api/test/prepare error:', e)
    return sendError('Failed to prepare test', 500)
  }
}

export function OPTIONS() { return new Response(null, { status: 204 }) }
