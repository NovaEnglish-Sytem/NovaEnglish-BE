import prisma from '../../../../src/lib/prisma.js'
import { json, forbidden, serverError } from '../../../../src/utils/http.js'
import { env, envHelpers } from '../../../../src/lib/env.js'

export async function POST(request) {
  try {
    const secret = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret') || ''
    if (!env.cronSecret || secret !== env.cronSecret) {
      return forbidden('Invalid cron secret')
    }

    // Prune revoked refresh tokens older than retention window
    const cutoffDate = envHelpers.getRevokedPruneCutoffDate()
    const now = new Date()

    const result = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          // Revoked tokens older than retention window
          { revokedAt: { not: null, lt: cutoffDate } },
          // Any tokens that are already expired, regardless of revoked status
          { expiresAt: { lt: now } },
        ],
      },
    })

    return json({ ok: true, deleted: result.count, cutoff: cutoffDate.toISOString(), now: now.toISOString() }, 200)
  } catch (err) {
    console.error('Cleanup refresh tokens error:', err)
    return serverError('Failed to cleanup refresh tokens')
  }
}

export function OPTIONS() { return new Response(null, { status: 204 }) }
