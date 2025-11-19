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

    const templates = await prisma.feedback.findMany({
      orderBy: { createdAt: 'asc' },
      include: { bandScore: true }
    })

    // Expose level name for FE compatibility
    const templatesPayload = templates.map(t => ({
      id: t.id,
      levelId: t.bandScoreId,
      level: t.bandScore?.band || '',
      text: t.text,
      order: undefined,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))

    return json({
      ok: true,
      data: { templates: templatesPayload }
    })
  } catch (error) {
    console.error('Get templates error:', error)
    return serverError('Failed to load templates')
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
    const { templates } = body

    if (!Array.isArray(templates)) {
      return json({ ok: false, error: 'Invalid templates data' }, { status: 400 })
    }

    // Validate: required fields
    for (const template of templates) {
      if (!template.level || !template.text || !template.level.trim()) {
        return json({ ok: false, error: 'Each template must have a non-empty level and text' }, { status: 400 })
      }
    }

    // Validate: duplicate template levels
    const levelsUpper = templates.map(t => t.level.trim().toUpperCase())
    const dupLevels = levelsUpper.filter((l, i) => levelsUpper.indexOf(l) !== i)
    if (dupLevels.length > 0) {
      return json({ ok: false, error: `Duplicate template levels: ${[...new Set(dupLevels)].join(', ')}` }, { status: 400 })
    }

    // Validate: template levels must exist in BandScore; map names -> ids
    const levelRows = await prisma.bandScore.findMany({ select: { id: true, band: true } })
    const levelNameToId = new Map(levelRows.map(r => [r.band, r.id]))
    const invalid = templates.filter(t => !levelNameToId.has(t.level))
    if (invalid.length > 0) {
      return json({ ok: false, error: `Unknown level(s) in templates: ${[...new Set(invalid.map(i => i.level))].join(', ')}` }, { status: 400 })
    }

    // Transaction: delete removed templates, then upsert all provided as Feedback(type=TEMPLATE)
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.feedback.findMany({ select: { id: true, bandScoreId: true } })
      const incomingLevelIds = templates.map(t => levelNameToId.get(t.level))

      // Delete templates that are not present in the incoming list
      const toDelete = existing.filter(e => !incomingLevelIds.includes(e.bandScoreId)).map(e => e.id)
      if (toDelete.length > 0) {
        await tx.feedback.deleteMany({ where: { id: { in: toDelete } } })
      }

      // Upsert incoming templates keyed by bandScoreId
      const outputs = []
      for (let i = 0; i < templates.length; i++) {
        const t = templates[i]
        const bandScoreId = levelNameToId.get(t.level)
        // emulate unique by bandScoreId; find then update/create
        const existingRow = await tx.feedback.findFirst({ where: { bandScoreId } })
        let row
        if (existingRow) {
          row = await tx.feedback.update({ where: { id: existingRow.id }, data: { text: t.text } })
        } else {
          row = await tx.feedback.create({ data: { text: t.text, bandScoreId } })
        }
        outputs.push(row)
      }

      return tx.feedback.findMany({ include: { bandScore: true }, orderBy: { createdAt: 'asc' } })
    })

    const templatesPayload = result.map(t => ({
      id: t.id,
      levelId: t.bandScoreId,
      level: t.bandScore?.band || '',
      text: t.text,
      order: undefined,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))

    return json({ ok: true, data: { templates: templatesPayload } })
  } catch (error) {
    console.error('Update templates error:', error)
    return serverError('Failed to update templates')
  }
}
