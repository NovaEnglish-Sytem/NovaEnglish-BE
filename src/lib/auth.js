import jwt from 'jsonwebtoken'
import { env } from './env.js'

export function signJwt(payload, options = {}) {
  const expDays = options.expiresInDays ?? env.accessTokenDays
  const expiresInSeconds = Math.floor(expDays * 24 * 60 * 60)
  return jwt.sign(payload, env.jwtSecret, { expiresIn: expiresInSeconds })
}

export function verifyJwt(token) {
  try {
    return jwt.verify(token, env.jwtSecret)
  } catch {
    return null
  }
}

function serializeCookie(name, value, attrs = {}) {
  const parts = [`${name}=${value}`]

  if (attrs.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(attrs.maxAge)}`)
  if (attrs.domain) parts.push(`Domain=${attrs.domain}`)
  if (attrs.path) parts.push(`Path=${attrs.path}`)
  if (attrs.expires instanceof Date) parts.push(`Expires=${attrs.expires.toUTCString()}`)
  if (attrs.httpOnly) parts.push('HttpOnly')
  if (attrs.secure) parts.push('Secure')
  if (attrs.sameSite) {
    const ss = String(attrs.sameSite).toLowerCase()
    if (['lax', 'strict', 'none'].includes(ss)) {
      parts.push(`SameSite=${ss[0].toUpperCase()}${ss.slice(1)}`)
    }
  }

  return parts.join('; ')
}

export function createAuthCookie({ token, maxAgeDays = env.accessTokenDays } = {}) {
  const maxAgeSeconds = maxAgeDays * 24 * 60 * 60
  // Important: 'localhost' is not a valid cookie Domain attribute.
  // Omit Domain for localhost so the cookie is accepted by the browser.
  const cookieDomain = env.appDomain && env.appDomain !== 'localhost' && env.appDomain.includes('.') ? env.appDomain : undefined
  return serializeCookie(env.cookieName, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    domain: cookieDomain,
    path: '/',
    maxAge: maxAgeSeconds,
  })
}

export function clearAuthCookie() {
  const cookieDomain = env.appDomain && env.appDomain !== 'localhost' && env.appDomain.includes('.') ? env.appDomain : undefined
  return serializeCookie(env.cookieName, '', {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    domain: cookieDomain,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
}

export function createRefreshCookie({ token, maxAgeDays = env.refreshTokenDays } = {}) {
  const maxAgeSeconds = maxAgeDays * 24 * 60 * 60
  const cookieDomain = env.appDomain && env.appDomain !== 'localhost' && env.appDomain.includes('.') ? env.appDomain : undefined
  return serializeCookie(env.refreshCookieName, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    domain: cookieDomain,
    path: '/',
    maxAge: maxAgeSeconds,
  })
}

export function clearRefreshCookie() {
  const cookieDomain = env.appDomain && env.appDomain !== 'localhost' && env.appDomain.includes('.') ? env.appDomain : undefined
  return serializeCookie(env.refreshCookieName, '', {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    domain: cookieDomain,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
}

export function parseCookies(cookieHeader = '') {
  const out = {}
  if (!cookieHeader) return out
  const pairs = cookieHeader.split(';')
  for (const p of pairs) {
    const [k, ...v] = p.trim().split('=')
    out[k] = v.join('=')
  }
  return out
}

export function getJwtFromRequest(request) {
  const cookieHeader = request.headers.get('cookie') || request.headers.get('Cookie') || ''
  const cookies = parseCookies(cookieHeader)
  return cookies[env.cookieName] || ''
}

export function getRefreshFromRequest(request) {
  const cookieHeader = request.headers.get('cookie') || request.headers.get('Cookie') || ''
  const cookies = parseCookies(cookieHeader)
  return cookies[env.refreshCookieName] || ''
}
