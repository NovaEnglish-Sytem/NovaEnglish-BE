import { requireAuth } from '../../../../src/middleware/require-auth.js'
import prisma from '../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../src/utils/http.js'
import { transformQuestionsToDraft } from '../../../../src/utils/questionTransformers.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) }, select: { id: true, role: true } })
    if (!user) return sendError('User not found', 401)
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return sendError('Access denied. Tutor role required.', 403)
    }

    const { searchParams } = new URL(request.url)
    const packageId = searchParams.get('packageId')

    // packageId is required
    if (!packageId) {
      return sendError('packageId query parameter is required', 400)
    }

    // Validate package exists
    const pkg = await prisma.questionPackage.findFirst({ where: { id: String(packageId) } })
    if (!pkg) return sendError('QuestionPackage not found', 404)

    // Load pages directly from package with media assets
    const pages = await prisma.questionPage.findMany({
      where: { packageId: String(packageId) },
      orderBy: { pageOrder: 'asc' },
      include: { 
        mediaAssets: true,
        questions: { 
          orderBy: { itemOrder: 'asc' },
          include: { mediaAssets: true }
        }
      }
    })

    // Map DB -> editor draft structure using shared helper
    const draftPages = transformQuestionsToDraft(pages)

    return sendSuccess({ 
      draft: { 
        id: pkg.id, 
        pages: draftPages, 
        quizDuration: pkg.durationMinutes 
      }
    })
  } catch (error) {
    console.error('GET /api/questions/draft error:', error)
    return sendError('Failed to load draft', 500)
  }
}
