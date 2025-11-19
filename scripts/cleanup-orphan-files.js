import { readdir, unlink } from 'fs/promises'
import { join } from 'path'
import prisma from '../src/lib/prisma.js'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

async function listFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const out = []
    for (const e of entries) {
      if (e.isFile()) out.push(e.name)
    }
    return out
  } catch (e) {
    console.error('[cleanup] Cannot read uploads dir:', e.message)
    return []
  }
}

async function main() {
  console.log('[cleanup] Start scan', new Date().toISOString())
  const files = await listFiles(UPLOAD_DIR)
  console.log(`[cleanup] Files in uploads/: ${files.length}`)
  const assets = await prisma.mediaAsset.findMany({ select: { storageKey: true } })
  const known = new Set(assets.map(a => a.storageKey).filter(Boolean))
  let removed = 0
  for (const f of files) {
    if (!known.has(f)) {
      try {
        await unlink(join(UPLOAD_DIR, f))
        removed++
        console.log('[cleanup] Removed orphan file:', f)
      } catch (e) {
        console.warn('[cleanup] Failed to remove', f, e.message)
      }
    }
  }
  console.log(`[cleanup] Done. Removed ${removed} orphan files.`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('[cleanup] Unhandled error:', e)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})
