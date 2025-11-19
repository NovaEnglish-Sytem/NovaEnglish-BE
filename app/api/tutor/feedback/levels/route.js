import prisma from '../../../../../src/lib/prisma.js'
import { json, unauthorized, forbidden, serverError } from '../../../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../../../src/middleware/require-auth.js'

export async function GET(request) {
  try {
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

    const levelsRows = await prisma.bandScore.findMany({
      orderBy: { order: 'asc' }
    })

    // Map to FE-compatible shape: level <- band
    const levels = levelsRows.map(l => ({
      id: l.id,
      level: l.band,
      minScore: l.minScore,
      maxScore: l.maxScore,
      order: l.order,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }))

    return json({
      ok: true,
      data: { levels }
    })
  } catch (error) {
    console.error('Get levels error:', error)
    return serverError('Failed to load levels')
  }
}

export async function PUT(request) {
  try {
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return unauthorized(auth.error)
    const { payload } = auth

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, role: true }
    })

    if (!user) return unauthorized('User not found')
    if (user.role !== 'ADMIN') {
      return forbidden('Access denied. Admin role required.')
    }

    const body = await request.json()
    const { levels } = body

    if (!Array.isArray(levels)) {
      return json({ ok: false, error: 'Invalid levels data' }, { status: 400 })
    }

    // Validate: no empty level names
    for (const level of levels) {
      if (!level.level || !level.level.trim()) {
        return json({ ok: false, error: 'Level name cannot be empty' }, { status: 400 })
      }
      if (level.minScore === undefined || level.maxScore === undefined) {
        return json({ ok: false, error: 'Missing required fields' }, { status: 400 })
      }
      if (parseInt(level.minScore) >= parseInt(level.maxScore)) {
        return json({ ok: false, error: `Level "${level.level}": minScore must be less than maxScore` }, { status: 400 })
      }
    }

    // Validate: no duplicate level names
    const levelNames = levels.map(l => l.level.trim().toUpperCase())
    const duplicates = levelNames.filter((name, index) => levelNames.indexOf(name) !== index)
    if (duplicates.length > 0) {
      return json({ ok: false, error: `Duplicate level names found: ${[...new Set(duplicates)].join(', ')}` }, { status: 400 })
    }

    // Validate: ascending ranges and next.min must be at least prev.max + 1
    const sortedLevels = [...levels].sort((a, b) => parseInt(a.minScore) - parseInt(b.minScore))
    for (let i = 0; i < sortedLevels.length - 1; i++) {
      const current = sortedLevels[i]
      const next = sortedLevels[i + 1]
      const currentMax = parseInt(current.maxScore)
      const nextMin = parseInt(next.minScore)
      if (nextMin < currentMax + 1) {
        return json({
          ok: false,
          error: `Invalid ranges: "${next.level}" must start at least from ${currentMax + 1} (previous max is ${currentMax}).`
        }, { status: 400 })
      }
    }

    // Upsert all levels (ordered by minScore ascending for consistent table sort)
    const orderedLevels = [...levels].sort((a, b) => parseInt(a.minScore) - parseInt(b.minScore))
    await prisma.$transaction(async (tx) => {
      // Clear all existing configs not present in incoming list
      const existing = await tx.bandScore.findMany({ select: { id: true, band: true } })
      const incomingNames = new Set(orderedLevels.map(l => String(l.level).trim()))
      const toDelete = existing.filter(e => !incomingNames.has(e.band)).map(e => e.id)
      if (toDelete.length) {
        // Delete feedback linked to band scores being removed
        await tx.feedback.deleteMany({ where: { bandScoreId: { in: toDelete } } })
        // Then delete band score rows
        await tx.bandScore.deleteMany({ where: { id: { in: toDelete } } })
      }
      for (let i = 0; i < orderedLevels.length; i++) {
        const level = orderedLevels[i]
        await tx.bandScore.upsert({
          where: { band: String(level.level).trim() },
          update: {
            minScore: parseInt(level.minScore),
            maxScore: parseInt(level.maxScore),
            order: i + 1
          },
          create: {
            band: String(level.level).trim(),
            minScore: parseInt(level.minScore),
            maxScore: parseInt(level.maxScore),
            order: i + 1
          }
        })
      }
    })

    const updatedRows = await prisma.bandScore.findMany({
      orderBy: { order: 'asc' }
    })

    const updatedLevels = updatedRows.map(l => ({
      id: l.id,
      level: l.band,
      minScore: l.minScore,
      maxScore: l.maxScore,
      order: l.order,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }))

    return json({
      ok: true,
      data: { levels: updatedLevels }
    })
  } catch (error) {
    console.error('Update levels error:', error)
    return serverError('Failed to update levels')
  }
}
