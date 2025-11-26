import { env } from './env.js'

export function isS3() {
  return env.storageDriver.toLowerCase() === 's3'
}

export function isLocal() {
  return !isS3()
}
