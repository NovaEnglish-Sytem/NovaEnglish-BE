import prisma from '../../../../src/lib/prisma.js'
import { sendError, sendSuccess } from '../../../../src/utils/http.js'
import { saveR2Stream, deleteR2Object } from '../../../../src/lib/storage-r2.js'
import { requireAuth } from '../../../../src/middleware/require-auth.js'
import { env } from '../../../../src/lib/env.js'

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

    const contentType = request.headers.get('content-type') || ''
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return sendError('Content-Type must be multipart/form-data', 415)
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const scope = String(formData.get('scope') || '').toLowerCase() // 'page' | 'item'
    const targetId = String(formData.get('targetId') || '')
    const typeOverride = String(formData.get('mediaType') || '').toUpperCase()

    if (!file || typeof file === 'string') return sendError('File is required', 400)
    if (!['page', 'item'].includes(scope)) return sendError('Invalid scope', 400)
    if (!targetId) return sendError('targetId is required', 400)

    const mime = (file.type || '').toLowerCase()
    const size = Number(file.size || 0)
    const isImage = typeOverride ? (typeOverride === 'IMAGE') : mime.startsWith('image/')
    const isAudio = typeOverride ? (typeOverride === 'AUDIO') : mime.startsWith('audio/')
    if (!isImage && !isAudio) return sendError('Only image or audio files are allowed', 415)
    
    // Validate file format
    const allowedImageTypes = env.mediaAllowedImageTypes.split(',').map(t => t.trim().toLowerCase())
    const allowedAudioTypes = env.mediaAllowedAudioTypes.split(',').map(t => t.trim().toLowerCase())
    
    if (isImage && !allowedImageTypes.includes(mime)) {
      return sendError(`Unsupported image format. Allowed: ${allowedImageTypes.join(', ')}`, 415)
    }
    if (isAudio && !allowedAudioTypes.includes(mime)) {
      return sendError(`Unsupported audio format. Allowed: ${allowedAudioTypes.join(', ')}`, 415)
    }
    
    // Validate file size
    const maxImage = env.mediaMaxImageMb * 1024 * 1024
    const maxAudio = env.mediaMaxAudioMb * 1024 * 1024
    if (isImage && size > maxImage) return sendError(`Image too large (max ${env.mediaMaxImageMb}MB)`, 413)
    if (isAudio && size > maxAudio) return sendError(`Audio too large (max ${env.mediaMaxAudioMb}MB)`, 413)

    // Verify target exists BEFORE any file write to avoid orphan files
    if (scope === 'page') {
      const exists = await prisma.questionPage.findFirst({ where: { id: targetId }, select: { id: true } })
      if (!exists) return sendError('QuestionPage not found', 404)
    } else {
      const exists = await prisma.questionItem.findFirst({ where: { id: targetId }, select: { id: true } })
      if (!exists) return sendError('QuestionItem not found', 404)
    }

    const stream = file.stream()
    const saved = await saveR2Stream(stream, file.name, size)
    const storageKey = saved.storageKey
    const publicUrl = saved.publicUrl
    const mediaType = isImage ? 'IMAGE' : 'AUDIO'

    // Replace existing asset (same owner + type)
    const whereOwner = scope === 'page' ? { pageId: targetId, itemId: null } : { itemId: targetId, pageId: null }
    const old = await prisma.mediaAsset.findFirst({ where: { ...whereOwner, type: mediaType } })

    // DELETE old asset FIRST to avoid unique constraint violation
    if (old) {
      await prisma.mediaAsset.delete({ where: { id: old.id } })
      try {
        await deleteR2Object(old.storageKey)
      } catch {}
    }

    // Now create new asset
    let created
    try {
      created = await prisma.mediaAsset.create({
        data: {
          type: mediaType,
          url: publicUrl,
          storageKey,
          ...(scope === 'page' ? { pageId: targetId } : { itemId: targetId })
        }
      })
    } catch (e) {
      try {
        await deleteR2Object(storageKey)
      } catch {}
      throw e
    }

    return sendSuccess({ asset: { ...created, publicUrl } }, 201)
  } catch (e) {
    console.error('POST /api/media/upload error:', e)
    return sendError('Failed to upload media', 500)
  }
}
