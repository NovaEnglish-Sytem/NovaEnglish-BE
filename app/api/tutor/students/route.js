import prisma from '../../../../src/lib/prisma.js'
import { json, unauthorized, forbidden, serverError } from '../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../src/middleware/require-auth.js'

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

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10)
    const search = searchParams.get('search') || ''
    const sortField = searchParams.get('sortField') || 'lastUpdate'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    // Build where clause
    const where = { role: 'STUDENT' }
    
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    }

    // Load students and their completed attempts
    const students = await prisma.user.findMany({
      where,
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
          }
        }
      }
    })

    // Compute per-student stats using completed attempts and TestRecord aggregates
    const studentsWithStats = await Promise.all(students.map(async (student) => {
      const attempts = student.testAttempts || []

      // Load all TestRecords with averages for this student, including attempts to derive category counts
      const records = await prisma.testRecord.findMany({
        where: { studentId: student.id, averageScore: { not: null } },
        select: {
          id: true,
          averageScore: true,
          createdAt: true,
          attempts: {
            where: { completedAt: { not: null }, categoryName: { not: null } },
            select: { categoryName: true },
          },
        },
      })

      const totalAttempts = records.length

      // Pick best TestRecord: higher averageScore, and if tie, more categories; if still tie, latest createdAt
      let bestAvg = 0
      let bestCategoryCount = -1
      let bestCreatedAt = null

      for (const rec of records) {
        const avg = typeof rec.averageScore === 'number' ? rec.averageScore : 0
        const categoryCount = new Set((rec.attempts || []).map(a => a.categoryName).filter(Boolean)).size
        const createdAt = rec.createdAt || new Date(0)

        const isBetter = (
          avg > bestAvg ||
          (avg === bestAvg && categoryCount > bestCategoryCount) ||
          (avg === bestAvg && categoryCount === bestCategoryCount && (!bestCreatedAt || createdAt > bestCreatedAt))
        )

        if (isBetter) {
          bestAvg = avg
          bestCategoryCount = categoryCount
          bestCreatedAt = createdAt
        }
      }

      // Latest completed attempt timestamp for lastUpdate
      let lastUpdate = null
      for (const a of attempts) {
        if (!lastUpdate || new Date(a.completedAt) > new Date(lastUpdate)) {
          lastUpdate = a.completedAt
        }
      }

      return {
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        bestAverageScore: bestAvg > 0 ? bestAvg : null,
        totalAttempts,
        lastUpdate,
      }
    }))

    let filtered = studentsWithStats

    // Apply sort
    filtered.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (sortField === 'lastUpdate') {
        aVal = aVal ? aVal.getTime() : 0
        bVal = bVal ? bVal.getTime() : 0
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    })

    // Apply pagination
    const total = filtered.length
    const skip = (page - 1) * pageSize
    const paginatedStudents = filtered.slice(skip, skip + pageSize)

    return json({
      ok: true,
      data: {
        students: paginatedStudents
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    })
  } catch (error) {
    console.error('Students list error:', error)
    return serverError('Failed to load students list')
  }
}