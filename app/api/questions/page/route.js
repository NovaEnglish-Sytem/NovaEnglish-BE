import prisma from '../../../../src/lib/prisma.js'
import { requireAuth } from '../../../../src/middleware/require-auth.js'
import { sendError, sendSuccess } from '../../../../src/utils/http.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    try { body = await request.json() } catch { return sendError('Invalid JSON body', 400) }
    const packageId = String(body?.packageId || '')
    if (!packageId) return sendError('packageId is required', 400)

    const pkg = await prisma.questionPackage.findFirst({ where: { id: packageId } })
    if (!pkg) return sendError('QuestionPackage not found', 404)

    // Determine pageOrder: if not provided, append to end
    const maxOrderRow = await prisma.questionPage.findFirst({ where: { packageId }, orderBy: { pageOrder: 'desc' } })
    const pageOrder = Number.isFinite(Number(body?.pageOrder)) && Number(body.pageOrder) > 0
      ? Number(body.pageOrder)
      : ((maxOrderRow?.pageOrder || 0) + 1)

    const page = await prisma.questionPage.create({
      data: {
        packageId,
        pageOrder,
        storyPassage: body?.storyPassage ?? null,
        instructions: body?.instructions ?? null,
      },
      select: { id: true, pageOrder: true, createdAt: true }
    })

    return sendSuccess({ page }, 201)
  } catch (e) {
    console.error('POST /api/questions/page error:', e)
    return sendError('Failed to create page placeholder', 500)
  }
}
