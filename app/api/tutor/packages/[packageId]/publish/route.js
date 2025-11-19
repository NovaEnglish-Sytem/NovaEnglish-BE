import prisma from '../../../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../../src/middleware/require-auth.js'

export async function PUT(request, { params }) {
  try {
    // Authenticate + single-device validation
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

    const { packageId } = await params

    // Check if package exists
    const packageRow = await prisma.questionPackage.findFirst({ where: { id: String(packageId) } })

    if (!packageRow) {
      return sendError('Package not found', 404)
    }

    // Validate that there is at least one question in package
    const pageIds = (await prisma.questionPage.findMany({ where: { packageId: String(packageId) }, select: { id: true } })).map(pg => pg.id)
    if (pageIds.length === 0) {
      return sendError('Cannot publish: no pages in package', 400)
    }
    const itemCount = await prisma.questionItem.count({ where: { pageId: { in: pageIds } } })
    if (itemCount === 0) {
      return sendError('Cannot publish package without questions', 400)
    }

    // Publish package
    const updatedPackage = await prisma.questionPackage.update({
      where: { id: String(packageId) },
      data: { status: 'PUBLISHED', updatedAt: new Date() }
    })

    return sendSuccess({
      package: {
        id: updatedPackage.id,
        title: updatedPackage.title,
        status: updatedPackage.status,
        updatedAt: updatedPackage.updatedAt
      },
      message: 'Package published successfully'
    })
  } catch (error) {
    console.error('PUT /api/tutor/packages/[packageId]/publish error:', error)
    return sendError('Failed to publish package', 500)
  }
}
