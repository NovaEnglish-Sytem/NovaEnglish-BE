import crypto from 'node:crypto'

export function generateTokenPair(bytes = 32) {
  const raw = crypto.randomBytes(bytes) // Buffer
  const token = base64UrlEncode(raw) // string form to send via email
  const tokenHash = sha256Hex(token)
  return { token, tokenHash }
}

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex')
}

export function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function addHours(date, hours) {
  const d = new Date(date.getTime())
  d.setHours(d.getHours() + hours)
  return d
}

export function isExpired(date) {
  return new Date() > new Date(date)
}