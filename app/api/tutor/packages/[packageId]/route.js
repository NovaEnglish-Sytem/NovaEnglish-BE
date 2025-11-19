import prisma from '../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../src/utils/http.js'
import { requireAuth } from '../../../../../src/middleware/require-auth.js'
import { join } from 'path'
import { unlink } from 'fs/promises'

export async function GET(request, { params }) {
  try {
    // Authenticate without single-device enforcement for tutors
    const auth = await requireAuth(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, role: true }
    })

    if (!user) return sendError('User not found', 401)
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return sendError('Access denied. Tutor role required.', 403)
    }

    const resolvedParams = await params
    const { packageId } = resolvedParams

    // Get package with category
    const packageRow = await prisma.questionPackage.findFirst({
      where: { id: String(packageId) },
      include: {
        category: { select: { id: true, name: true } },
      }
    })

    if (!packageRow) {
      return sendError('Package not found', 404)
    }

    // Load pages directly from package
    const pages = await prisma.questionPage.findMany({
        where: { packageId: packageRow.id },
        orderBy: { pageOrder: 'asc' },
        include: {
          questions: {
            orderBy: { itemOrder: 'asc' }
          }
        }
      })

    return sendSuccess({
      package: {
        id: packageRow.id,
        title: packageRow.title,
        categoryName: packageRow.category?.name || '',
        durationMinutes: packageRow.durationMinutes || 0,
        status: packageRow.status || 'DRAFT',
        pages: pages.map(pg => ({
          id: pg.id,
          pageOrder: pg.pageOrder,
          storyPassage: pg.storyPassage,
          instructions: pg.instructions,
          items: pg.questions.map(it => ({
            id: it.id,
            itemOrder: it.itemOrder,
            type: it.type,
            question: it.question,
            choicesJson: it.choicesJson,
            correctKey: it.correctKey,
            answerText: it.answerText,
            mediaId: it.mediaId
          }))
        })),
        createdAt: packageRow.createdAt,
        updatedAt: packageRow.updatedAt
      }
    })
  } catch (error) {
    console.error('GET /api/tutor/packages/[packageId] error:', error)
    return sendError('Failed to fetch package', 500)
  }
}

export async function PUT(request, { params }) {
  try {
    // Authenticate without single-device enforcement for tutors
    const auth = await requireAuth(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, role: true }
    })

    if (!user) return sendError('User not found', 401)
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return sendError('Access denied. Tutor role required.', 403)
    }

    const resolvedParams = await params
    const { packageId } = resolvedParams
    const body = await request.json()
    const { title } = body

    // Check if package exists
    const packageRow = await prisma.questionPackage.findFirst({ where: { id: String(packageId) } })

    if (!packageRow) {
      return sendError('Package not found', 404)
    }

    // Build update data
    const updateData = {
      updatedAt: new Date()
    }

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return sendError('Title must be a non-empty string', 400)
      }
      updateData.title = title.trim()
    }

    // durationMinutes is now in QuestionPackage

    // Update package
    const updatedPackage = await prisma.questionPackage.update({ where: { id: String(packageId) }, data: updateData })

    return sendSuccess({
      package: {
        id: updatedPackage.id,
        title: updatedPackage.title,
        status: updatedPackage.status,
        updatedAt: updatedPackage.updatedAt
      }
    })
  } catch (error) {
    console.error('PUT /api/tutor/packages/[packageId] error:', error)
    return sendError('Failed to update package', 500)
  }
}

export async function DELETE(request, { params }) {
  try {
    // Authenticate without single-device session enforcement for tutors
    const auth = await requireAuth(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, role: true }
    })

    if (!user) return sendError('User not found', 401)
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return sendError('Access denied. Tutor role required.', 403)
    }

    const resolvedParams = await params
    const { packageId } = resolvedParams

    // Check if package exists
    const packageRow = await prisma.questionPackage.findFirst({ where: { id: String(packageId) } })

    if (!packageRow) {
      return sendError('Package not found', 404)
    }

    // Prevent deletion if package is published
    if (packageRow.status === 'PUBLISHED') {
      return sendError('Cannot delete published package. Please unpublish it first.', 400, { 
        code: 'PACKAGE_PUBLISHED' 
      })
    }

    // Collect related media storage keys before cascade delete
    const mediaAssets = await prisma.mediaAsset.findMany({
      where: {
        OR: [
          { page: { packageId: String(packageId) } },
          { item: { page: { packageId: String(packageId) } } },
        ]
      },
      select: { storageKey: true }
    })

    // Hard delete package (cascades to pages/items/media via FK)
    await prisma.questionPackage.delete({ where: { id: String(packageId) } })

    // Best-effort: remove physical files after DB delete
    if (Array.isArray(mediaAssets) && mediaAssets.length) {
      for (const m of mediaAssets) {
        if (!m?.storageKey) continue
        try {
          const filePath = join(process.cwd(), 'uploads', m.storageKey)
          await unlink(filePath)
        } catch (e) {
          // ignore missing files
          console.warn('Could not delete file during package cascade:', m.storageKey, e.message)
        }
      }
    }

    return sendSuccess({ message: 'Package deleted successfully' })
  } catch (error) {
    console.error('DELETE /api/tutor/packages/[packageId] error:', error)
    return sendError('Failed to delete package', 500)
  }
}
