import { getJwtFromRequest, verifyJwt } from '../lib/auth.js'
import { validateSession } from './session-validator.js'

export async function requireAuthAndSession(request) {
  const token = getJwtFromRequest(request)
  if (!token) {
    return { ok: false, status: 401, error: 'Not authenticated' }
  }
  const payload = verifyJwt(token)
  if (!payload?.sub) {
    return { ok: false, status: 401, error: 'Invalid token' }
  }
  // Relaxed: skip single-device validation for Tutor/Admin
  const role = String(payload.role || '').toUpperCase()
  if (role !== 'TUTOR' && role !== 'ADMIN') {
    const sessionError = await validateSession(payload)
    if (sessionError) {
      return { ok: false, status: sessionError.status, error: sessionError.error, code: sessionError.code }
    }
  }
  return { ok: true, payload }
}

export async function requireAuth(request) {
  const token = getJwtFromRequest(request)
  if (!token) {
    return { ok: false, status: 401, error: 'Not authenticated' }
  }
  const payload = verifyJwt(token)
  if (!payload?.sub) {
    return { ok: false, status: 401, error: 'Invalid token' }
  }
  return { ok: true, payload }
}
