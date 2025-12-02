import prisma from '../../../../src/lib/prisma.js'
import { sendSuccess, sendError } from '../../../../src/utils/http.js'
import { env } from '../../../../src/lib/env.js'

export async function POST(request) {
  try {
    // Validate cron secret
    const cronSecret = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret') || ''
    if (env.cronSecret && cronSecret !== env.cronSecret) {
      return sendError('Unauthorized', 401)
    }

    const months = env.testResultRetentionMonths ?? 12

    // Use calendar months and normalize to start of month (00:00) so retention
    // is evaluated based on month granularity, not exact day/time.
    const now = new Date()
    const cutoffDate = new Date(now.getTime())
    cutoffDate.setMonth(cutoffDate.getMonth() - months)
    cutoffDate.setDate(1)
    cutoffDate.setHours(0, 0, 0, 0)

    // Find old TestRecords that are beyond retention window
    const oldRecords = await prisma.testRecord.findMany({
      where: { createdAt: { lt: cutoffDate } },
      select: { id: true },
    })

    if (oldRecords.length === 0) {
      return sendSuccess({
        success: true,
        retentionMonths: months,
        cutoffDate: cutoffDate.toISOString(),
        deletedRecords: 0,
        deletedAttempts: 0,
        timestamp: new Date().toISOString(),
      })
    }

    const recordIds = oldRecords.map((r) => r.id)

    // Delete attempts linked to those records and then the records themselves
    const [deletedAttempts, deletedRecords] = await prisma.$transaction([
      prisma.testAttempt.deleteMany({ where: { recordId: { in: recordIds } } }),
      prisma.testRecord.deleteMany({ where: { id: { in: recordIds } } }),
    ])

    return sendSuccess({
      success: true,
      retentionMonths: months,
      cutoffDate: cutoffDate.toISOString(),
      deletedRecords: deletedRecords.count,
      deletedAttempts: deletedAttempts.count,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.error('Cleanup historical results error:', e)
    return sendError('Cleanup results failed', 500)
  }
}
