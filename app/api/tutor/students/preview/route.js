import prisma from '../../../../../src/lib/prisma.js'
import { json, unauthorized, forbidden, serverError } from '../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'

export async function GET(request) {
  try {
    // Authenticate + single-device validation
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return unauthorized(auth.error)
    const { payload } = auth

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, role: true }
    })

    if (!user) return unauthorized('User not found')
    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      return forbidden('Access denied. Tutor role required.')
    }

    // Load students and their completed attempts
    const students = await prisma.user.findMany({
      where: { role: 'STUDENT' },
      select: {
        id: true,
        fullName: true,
        email: true,
        testAttempts: {
          where: { 
            completedAt: { not: null },
            totalScore: { gt: 0 }
          },
          select: { 
            id: true, 
            packageId: true, 
            completedAt: true, 
            totalScore: true,
            packageTitle: true,
            categoryName: true
          },
          orderBy: { completedAt: 'desc' }
        }
      },
      take: 200
    })

    // Compute stats per student using completed attempts and TestRecord aggregates
    const computed = await Promise.all(students.map(async (s) => {
      const attempts = s.testAttempts || []
      // Aggregations from TestRecord
      const [totalRecords, bestAvgAgg] = await Promise.all([
        prisma.testRecord.count({ where: { studentId: s.id, averageScore: { not: null } } }),
        prisma.testRecord.aggregate({ where: { studentId: s.id }, _max: { averageScore: true } })
      ])

      // Latest completed attempt timestamp for lastUpdate
      let lastUpdate = null
      for (const a of attempts) {
        if (!lastUpdate || new Date(a.completedAt) > new Date(lastUpdate)) {
          lastUpdate = a.completedAt
        }
      }

      // Best average score across TestRecords
      const bestAverageScore = (bestAvgAgg?._max?.averageScore ?? null)

      return {
        id: s.id,
        fullName: s.fullName,
        email: s.email,
        bestAverageScore,
        totalAttempts: totalRecords,
        lastUpdate
      }
    }))

    // Sort by lastUpdate (desc), then by bestBandScore (desc) as tiebreaker
    computed.sort((a, b) => {
      const at = a.lastUpdate ? new Date(a.lastUpdate).getTime() : 0
      const bt = b.lastUpdate ? new Date(b.lastUpdate).getTime() : 0
      if (bt !== at) return bt - at
      const ab = a.bestBandScore ?? -Infinity
      const bb = b.bestBandScore ?? -Infinity
      return bb - ab
    })

    const top5 = computed.slice(0, 5)

    return json({
      ok: true,
      data: { students: top5 }
    })
  } catch (error) {
    console.error('Students preview error:', error)
    return serverError('Failed to load students preview')
  }
}