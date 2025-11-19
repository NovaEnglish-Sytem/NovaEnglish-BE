import { requireAuth } from '../../../../src/middleware/require-auth.js'
import prisma from '../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../src/utils/http.js'

export async function GET(request) {
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

    // Get all categories (QuestionCategory)
    const categories = await prisma.questionCategory.findMany({
      include: {
        packages: {
          select: { id: true }
        }
      },
      orderBy: {
        name: 'asc'
      }
    })

    // Format response with package count
    const formattedCategories = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      packageCount: (cat.packages || []).length,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt
    }))

    return sendSuccess({ categories: formattedCategories })
  } catch (error) {
    console.error('GET /api/tutor/categories error:', error)
    return sendError('Failed to fetch categories', 500)
  }
}

export async function POST(request) {
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

    const body = await request.json()
    const { name } = body

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return sendError('Category name is required', 400)
    }

    const trimmedName = name.trim()

    // Check if category name already exists (case-insensitive)
    const existingCategory = await prisma.questionCategory.findFirst({
      where: {
        name: {
          equals: trimmedName,
          mode: 'insensitive'
        }
      }
    })

    if (existingCategory) {
      return sendError('Category name already exists', 409)
    }

    // Create category (no code field, no createdById)
    const category = await prisma.questionCategory.create({
      data: {
        name: trimmedName
      }
    })

    return sendSuccess(
      {
        category: {
          id: category.id,
          name: category.name,
          packageCount: 0,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt
        }
      },
      201
    )
  } catch (error) {
    console.error('POST /api/tutor/categories error:', error)
    return sendError('Failed to create category', 500)
  }
}