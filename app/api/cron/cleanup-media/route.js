import prisma from '../../../../src/lib/prisma.js'
import { sendSuccess, sendError } from '../../../../src/utils/http.js'
import { env } from '../../../../src/lib/env.js'
import { isS3 } from '../../../../src/lib/storage.js'
import { listAllR2Keys, deleteR2Object } from '../../../../src/lib/storage-r2.js'

export async function POST(request) {
  try {
    const cronSecret = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret') || ''
    if (env.cronSecret && cronSecret !== env.cronSecret) {
      return sendError('Unauthorized', 401)
    }

    if (!isS3()) {
      return sendSuccess({
        success: true,
        driver: 'local',
        message: 'storageDriver is local; skipping R2 cleanup',
      })
    }

    const url = new URL(request.url)
    const maxParam = url.searchParams.get('max')
    let maxKeys = Number.parseInt(maxParam || '0', 10)
    if (!Number.isFinite(maxKeys) || maxKeys <= 0) {
      maxKeys = 10000
    }

    const assets = await prisma.mediaAsset.findMany({
      select: { storageKey: true },
    })
    const existingKeys = new Set(assets.map(a => a.storageKey).filter(Boolean))

    const objectKeys = await listAllR2Keys(maxKeys)

    let deleted = 0
    let kept = 0
    const sampleDeletedKeys = []

    for (const key of objectKeys) {
      if (!existingKeys.has(key)) {
        try {
          await deleteR2Object(key)
          deleted += 1
          if (sampleDeletedKeys.length < 50) {
            sampleDeletedKeys.push(key)
          }
        } catch (e) {
          console.warn('Failed to delete orphan R2 object:', key, e?.message)
        }
      } else {
        kept += 1
      }
    }

    return sendSuccess({
      success: true,
      scanned: objectKeys.length,
      deleted,
      kept,
      sampleDeletedKeys,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.error('Cleanup media cron error:', e)
    return sendError('Cleanup media failed', 500)
  }
}
