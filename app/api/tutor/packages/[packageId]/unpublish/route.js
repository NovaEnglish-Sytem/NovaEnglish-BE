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

    // Next.js 15: await params before accessing properties
    const resolvedParams = await params
    const packageId = String(resolvedParams.packageId)

    // Check if package exists
    const packageRow = await prisma.questionPackage.findFirst({ where: { id: packageId } })

    if (!packageRow) {
      return sendError('Package not found', 404)
    }

    // Unpublish package
    const updatedPackage = await prisma.questionPackage.update({
      where: { id: packageId },
      data: { status: 'DRAFT', updatedAt: new Date() }
    })

    return sendSuccess({
      package: {
        id: updatedPackage.id,
        title: updatedPackage.title,
        status: updatedPackage.status,
        updatedAt: updatedPackage.updatedAt
      },
      message: 'Package unpublished successfully'
    })
  } catch (error) {
    console.error('PUT /api/tutor/packages/[packageId]/unpublish error:', error)
    return sendError('Failed to unpublish package', 500)
  }
}
