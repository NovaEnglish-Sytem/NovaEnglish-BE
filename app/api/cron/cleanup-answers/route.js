import prisma from '../../../../src/lib/prisma.js'
import { sendSuccess, sendError } from '../../../../src/utils/http.js'

import { env } from '../../../../src/lib/env.js'

export async function GET(request) {
  try {
    // Verify cron secret
    const cronSecret = request.headers.get('x-cron-secret')
    
    if (env.cronSecret && cronSecret !== env.cronSecret) {
      return sendError('Unauthorized', 401)
    }
    
    // Get test data cleanup retention period from env
    const retentionDays = env.testDataCleanupDays
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    
    // 1. Cleanup temporary answers older than retention period (use createdAt)
    const deletedAnswers = await prisma.temporaryAnswer.deleteMany({
      where: {
        createdAt: { lt: cutoffDate }
      }
    })
    
    // 2. Cleanup test sessions older than retention period AND their temporary answers atomically
    //    Note: We intentionally DO NOT delete sessions immediately on expiry.
    //    They are retained until cutoffDate to allow auto-submit on login/page visit.
    const expiredSessions = await prisma.activeTestSession.findMany({
      where: { expiresAt: { lt: cutoffDate } },
      select: { id: true, attemptId: true }
    })
    let deletedSessions = { count: 0 }
    if (expiredSessions.length > 0) {
      const sessionIds = expiredSessions.map(s => s.id)
      const attemptIds = expiredSessions.map(s => s.attemptId)
      await prisma.$transaction([
        prisma.temporaryAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } }),
        prisma.activeTestSession.deleteMany({ where: { id: { in: sessionIds } } })
      ])
      deletedSessions = { count: sessionIds.length }
    }
    
    // 3. Cleanup incomplete test attempts older than retention period (use startedAt)
    // This handles cases where student never returned after starting
    const deletedAttempts = await prisma.testAttempt.deleteMany({
      where: {
        completedAt: null,
        startedAt: { lt: cutoffDate }
      }
    })
    
    // 4. Cleanup incomplete test records older than retention period
    const deletedRecords = await prisma.testRecord.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        attempts: { none: {} } // Only delete records with no attempts
      }
    })
    
    console.log(`🧹 Test data cleanup completed (retention: ${retentionDays} days):`)
    console.log(`   - Deleted ${deletedAnswers.count} temporary answers`)
    console.log(`   - Deleted ${deletedSessions.count} expired test sessions`)
    console.log(`   - Deleted ${deletedAttempts.count} incomplete test attempts`)
    console.log(`   - Deleted ${deletedRecords.count} empty test records`)
    
    return sendSuccess({
      success: true,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      deletedAnswers: deletedAnswers.count,
      deletedSessions: deletedSessions.count,
      deletedAttempts: deletedAttempts.count,
      deletedRecords: deletedRecords.count,
      timestamp: new Date().toISOString()
    })
    
  } catch (e) {
    console.error('Cleanup cron error:', e)
    return sendError('Cleanup failed', 500)
  }
}

export function OPTIONS() { return new Response(null, { status: 204 }) }
