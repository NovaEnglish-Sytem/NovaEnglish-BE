import { Readable } from 'node:stream'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { env } from './env.js'

const client = new S3Client({
  region: 'auto',
  endpoint: env.r2Endpoint,
  credentials: {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
  },
})

function ensureReadable(body) {
  if (!body) return Readable.from([])
  if (typeof body.pipe === 'function') return body
  if (typeof Readable.fromWeb === 'function' && typeof body.getReader === 'function') {
    return Readable.fromWeb(body)
  }
  return Readable.from(body)
}

export function getR2PublicUrl(storageKey) {
  if (!storageKey) return ''
  const base = (env.r2PublicBaseUrl || `${env.r2Endpoint}/${env.r2Bucket}`).replace(/\/+$/, '')
  return `${base}/${encodeURIComponent(storageKey)}`
}

export async function saveR2Stream(readable, originalName, contentLength) {
  const ext = (originalName || '').split('.').pop() || 'bin'
  const key = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}.${ext}`
  const body = ensureReadable(readable)

  const putParams = {
    Bucket: env.r2Bucket,
    Key: key,
    Body: body,
  }

  if (typeof contentLength === 'number' && Number.isFinite(contentLength) && contentLength >= 0) {
    putParams.ContentLength = contentLength
  }

  await client.send(new PutObjectCommand(putParams))

  const publicUrl = getR2PublicUrl(key)
  return { storageKey: key, publicUrl }
}

export async function deleteR2Object(storageKey) {
  if (!storageKey) return
  try {
    await client.send(new DeleteObjectCommand({
      Bucket: env.r2Bucket,
      Key: storageKey,
    }))
  } catch (e) {}
}
