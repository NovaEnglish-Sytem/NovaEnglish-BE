import prisma from '../../../../src/lib/prisma.js'
import { json, forbidden, serverError } from '../../../../src/utils/http.js'
import { env } from '../../../../src/lib/env.js'

export async function POST(request) {
  try {
    const secret = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret') || ''
    if (!env.cronSecret || secret !== env.cronSecret) {
      return forbidden('Invalid cron secret')
    }

    // Delete all expired verification tokens
    const now = new Date()
    const result = await prisma.verificationToken.deleteMany({
      where: { expiresAt: { lt: now } },
    })

    return json({ ok: true, deleted: result.count, cutoff: now.toISOString() }, 200)
  } catch (err) {
    console.error('Cleanup verification tokens error:', err)
    return serverError('Failed to cleanup verification tokens')
  }
}

export function OPTIONS() { return new Response(null, { status: 204 }) }
