import prisma from '../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../src/utils/http.js'
import { requireAuth } from '../../../../src/middleware/require-auth.js'
import { isLocal } from '../../../../src/lib/storage.js'
import { deleteR2Object } from '../../../../src/lib/storage-r2.js'
import { join } from 'path'
import { unlink } from 'fs/promises'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(request, { params }) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return sendError(auth.error, auth.status, { code: auth.code })
    const { payload } = auth

    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) }, select: { id: true, role: true } })
    if (!user) return sendError('User not found', 401)
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return sendError('Access denied. Tutor role required.', 403)
    }

    const { id } = params
    const idStr = String(id)
    
    // Support two formats:
    // 1. Direct asset ID: DELETE /api/media/{assetId}
    // 2. Query-based: DELETE /api/media/{targetId}?scope=page&type=IMAGE
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope')
    const type = url.searchParams.get('type')
    
    let asset
    if (scope && type) {
      // Query by targetId + scope + type
      const whereOwner = scope === 'page' 
        ? { pageId: idStr, itemId: null } 
        : { itemId: idStr, pageId: null }
      asset = await prisma.mediaAsset.findFirst({ 
        where: { ...whereOwner, type: type.toUpperCase() } 
      })
    } else {
      // Direct ID lookup
      asset = await prisma.mediaAsset.findUnique({ where: { id: idStr } })
    }
    
    if (!asset) return sendError('Media asset not found', 404)

    // Delete from database
    await prisma.mediaAsset.delete({ where: { id: asset.id } })

    // Delete physical file (best effort)
    try {
      if (isLocal()) {
        const filePath = join(process.cwd(), 'uploads', asset.storageKey)
        await unlink(filePath)
      } else {
        await deleteR2Object(asset.storageKey)
      }
    } catch (e) {
      // Ignore file deletion errors (file may not exist)
      console.warn('Could not delete file:', asset.storageKey, e.message)
    }

    return sendSuccess({ message: 'Media deleted successfully' })
  } catch (e) {
    console.error('DELETE /api/media/[id] error:', e)
    return sendError('Failed to delete media', 500)
  }
}
