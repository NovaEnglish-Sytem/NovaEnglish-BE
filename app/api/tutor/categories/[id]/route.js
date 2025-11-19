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
    const { id } = resolvedParams

    // Get category with packages
    const category = await prisma.questionCategory.findFirst({
      where: {
        id: String(id),
      },
      include: {
        packages: { orderBy: { createdAt: 'desc' } }
      }
    })

    if (!category) {
      return sendError('Category not found', 404)
    }

    // Format packages with question counts (from cached DB value)
    const formattedPackages = (category.packages || []).map((pkg) => ({
      id: pkg.id,
      title: pkg.title,
      durationMinutes: pkg.durationMinutes || 0,
      status: pkg.status || 'DRAFT',
      questionCount: pkg.totalQuestions || 0,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt
    }))

    return sendSuccess({
      category: {
        id: category.id,
        name: category.name,
        packages: formattedPackages,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      }
    })
  } catch (error) {
    console.error('GET /api/tutor/categories/[id] error:', error)
    return sendError('Failed to fetch category', 500)
  }
}

export async function PUT(request, { params }) {
  try {
    // Authenticate without single-device enforcement for tutors (consistent with GET)
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

    const resolvedParamsPut = await params
    const { id } = resolvedParamsPut
    const body = await request.json()
    const { name } = body

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return sendError('Category name is required', 400)
    }

    const trimmedName = name.trim()

    // Check if category exists
    const category = await prisma.questionCategory.findFirst({
      where: {
        id: String(id),
      }
    })

    if (!category) {
      return sendError('Category not found', 404)
    }

    // Check if new name already exists (case-insensitive, excluding current category)
    const existingCategory = await prisma.questionCategory.findFirst({
      where: {
        name: {
          equals: trimmedName,
          mode: 'insensitive'
        },
        id: {
          not: String(id)
        }
      }
    })

    if (existingCategory) {
      return sendError('Category name already exists', 409)
    }

    // Update category
    const updatedCategory = await prisma.questionCategory.update({
      where: {
        id: String(id)
      },
      data: {
        name: trimmedName,
        updatedAt: new Date()
      }
    })

    return sendSuccess({
      category: {
        id: updatedCategory.id,
        name: updatedCategory.name,
        createdAt: updatedCategory.createdAt,
        updatedAt: updatedCategory.updatedAt
      }
    })
  } catch (error) {
    console.error('PUT /api/tutor/categories/[id] error:', error)
    return sendError('Failed to update category', 500)
  }
}

export async function DELETE(request, { params }) {
  try {
    // Authenticate without single-device enforcement for tutors (consistent with GET)
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

    const resolvedParamsDel = await params
    const { id } = resolvedParamsDel

    // Check if category exists and has published packages
    const category = await prisma.questionCategory.findFirst({
      where: {
        id: String(id),
      },
      include: {
        packages: {
          where: { status: 'PUBLISHED' },
          select: { id: true, title: true }
        }
      }
    })

    if (!category) {
      return sendError('Category not found', 404)
    }

    // Prevent deletion if category has published packages
    if (category.packages && category.packages.length > 0) {
      return sendError('Cannot delete category with published packages. Please unpublish all packages first.', 400, { 
        code: 'HAS_PUBLISHED_PACKAGES',
        publishedPackages: category.packages 
      })
    }

    // Collect related media storage keys before cascade delete
    const mediaAssets = await prisma.mediaAsset.findMany({
      where: {
        OR: [
          { page: { package: { categoryId: String(id) } } },
          { item: { page: { package: { categoryId: String(id) } } } },
        ]
      },
      select: { storageKey: true }
    })

    // Delete category (cascades to packages -> pages -> items -> media)
    await prisma.questionCategory.delete({ where: { id: String(id) } })

    // Best-effort: unlink files after DB deletion
    if (Array.isArray(mediaAssets) && mediaAssets.length) {
      for (const m of mediaAssets) {
        if (!m?.storageKey) continue
        try {
          await unlink(join(process.cwd(), 'uploads', m.storageKey))
        } catch (e) {
          console.warn('Could not delete file during category cascade:', m.storageKey, e.message)
        }
      }
    }

    return sendSuccess({ message: 'Category deleted successfully' })
  } catch (error) {
    console.error('DELETE /api/tutor/categories/[id] error:', error)
    return sendError('Failed to delete category', 500)
  }
}
