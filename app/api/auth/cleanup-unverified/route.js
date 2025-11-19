import prisma from '../../../../src/lib/prisma.js'
import { json, forbidden, serverError } from '../../../../src/utils/http.js'
import { env } from '../../../../src/lib/env.js'

export async function POST(request) {
  try {
    const secret = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret') || ''
    if (!env.cronSecret || secret !== env.cronSecret) {
      return forbidden('Invalid cron secret')
    }

    const days = Number(env.unverifiedRetentionDays || 30)
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Delete users that have not verified email and createdAt is older than cutoff
    const result = await prisma.user.deleteMany({
      where: {
        isEmailVerified: false,
        createdAt: { lt: cutoff },
      },
    })

    return json({ ok: true, deleted: result.count, cutoff: cutoff.toISOString() }, 200)
  } catch (err) {
    console.error('Cleanup unverified error:', err)
    return serverError('Failed to cleanup unverified accounts')
  }
}
