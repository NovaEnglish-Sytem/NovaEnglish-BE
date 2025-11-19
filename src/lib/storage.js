import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { env } from './env.js'
import crypto from 'crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

function ensureDir() {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
}

export function getLocalPublicUrl(storageKey) {
  // Served by route handler /api/media/file/[key]
  const isDev = env.nodeEnv !== 'production'
  let base = env.mediaBaseUrl
  
  if (isDev && !base) {
    // Development: explicit backend URL
    base = `http://localhost:${env.port}`
  }
  
  return `${base}/api/media/file/${encodeURIComponent(storageKey)}`
}

export async function saveLocalStream(readable, originalName) {
  ensureDir()
  const ext = (originalName || '').split('.').pop() || 'bin'
  const key = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`
  const filePath = join(UPLOAD_DIR, key)
  const ws = createWriteStream(filePath)
  // Convert Web ReadableStream to Node.js stream if necessary
  const nodeReadable = typeof readable?.pipe === 'function'
    ? readable
    : (typeof Readable.fromWeb === 'function' && readable) 
      ? Readable.fromWeb(readable)
      : Readable.from(readable)

  await pipeline(nodeReadable, ws)
  return { storageKey: key, filePath }
}

export async function getFileStream(storageKey) {
  const { createReadStream } = await import('fs')
  const path = join(UPLOAD_DIR, storageKey)
  return createReadStream(path)
}

export function isS3() {
  return env.storageDriver.toLowerCase() === 's3'
}

export function isLocal() {
  return !isS3()
}
