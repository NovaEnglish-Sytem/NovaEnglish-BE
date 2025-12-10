import prisma from '../../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../../src/middleware/require-auth.js'

// Generate package title: "[prefix]-pkg[number]" (e.g., "list-pkg001")
// Prefix = first 4 chars of category name (lowercase, no spaces)
async function generatePackageTitle(categoryId) {
  // Get category name
  const category = await prisma.questionCategory.findUnique({
    where: { id: categoryId },
    select: { name: true }
  })
  
  if (!category) {
    throw new Error('Category not found')
  }
  
  // Get prefix from category name (first 4 chars, lowercase, no spaces)
  const prefix = category.name
    .toLowerCase()
    .replace(/\s+/g, '') // remove spaces
    .substring(0, 4)
  
  // Get next package number for this category
  const existingPackages = await prisma.questionPackage.findMany({
    where: { categoryId },
    select: { title: true },
    orderBy: { createdAt: 'desc' }
  })
  
  // Extract numbers from existing packages with same prefix
  let nextNumber = 1
  const pattern = new RegExp(`^${prefix}-pkg(\\d+)$`)
  for (const pkg of existingPackages) {
    const match = pkg.title.match(pattern)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num >= nextNumber) {
        nextNumber = num + 1
      }
    }
  }
  
  return `${prefix}-pkg${String(nextNumber).padStart(3, '0')}`
}

export async function POST(request, { params }) {
  try {
    const auth = await requireAuthAndSession(request)
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
    const { id: categoryId } = resolvedParams
    // No request body used for this endpoint

    // Check if category exists
    const category = await prisma.questionCategory.findFirst({
      where: {
        id: String(categoryId),
      }
    })

    if (!category) {
      return sendError('Category not found', 404)
    }

    // Auto-generate title using category prefix
    // Format: "[category-prefix]-pkg[number]" (e.g., "list-pkg001", "read-pkg002")
    const title = await generatePackageTitle(String(categoryId))

    // Create QuestionPackage (no createdById)
    const packageData = await prisma.questionPackage.create({
      data: {
        title,
        categoryId: String(categoryId),
        status: 'DRAFT',
        durationMinutes: 0
      }
    })

    return sendSuccess(
      {
        package: {
          id: packageData.id,
          title: packageData.title,
          status: packageData.status,
          categoryId: packageData.categoryId,
          totalQuestions: packageData.totalQuestions || 0,
          durationMinutes: packageData.durationMinutes || 0,
          createdAt: packageData.createdAt,
          updatedAt: packageData.updatedAt
        }
      },
      201
    )
  } catch (error) {
    console.error('POST /api/tutor/categories/[id]/packages error:', error)
    return sendError('Failed to create package', 500)
  }
}