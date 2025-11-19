import prisma from '../../../../src/lib/prisma.js'
import { json } from '../../../../src/utils/http.js'
import { getRefreshFromRequest, createAuthCookie, createRefreshCookie, signJwt, clearAuthCookie, clearRefreshCookie } from '../../../../src/lib/auth.js'
import { sha256Hex, generateTokenPair } from '../../../../src/utils/tokens.js'
import { envHelpers } from '../../../../src/lib/env.js'

// POST /api/auth/refresh
export async function POST(request) {
  try {
    const refreshToken = getRefreshFromRequest(request)
    if (!refreshToken) {
      // Clear cookies on missing token
      const cleared = clearAuthCookie()
      const clearedRefresh = clearRefreshCookie()
      return json(
        { ok: false, error: 'Missing refresh token' },
        { status: 401, headers: { 'set-cookie': [cleared, clearedRefresh] } }
      )
    }

    const tokenHash = sha256Hex(refreshToken)
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash } })
    
    // Clear cookies if token revoked or invalid
    if (!record || record.revokedAt) {
      const cleared = clearAuthCookie()
      const clearedRefresh = clearRefreshCookie()
      return json(
        { ok: false, error: 'Invalid refresh token' },
        { status: 401, headers: { 'set-cookie': [cleared, clearedRefresh] } }
      )
    }
    
    // Clear cookies if token expired
    if (new Date() > record.expiresAt) {
      const cleared = clearAuthCookie()
      const clearedRefresh = clearRefreshCookie()
      return json(
        { ok: false, error: 'Expired refresh token' },
        { status: 401, headers: { 'set-cookie': [cleared, clearedRefresh] } }
      )
    }

    const user = await prisma.user.findUnique({ 
      where: { id: record.userId }, 
      select: { id: true, role: true, lastLogin: true }  // Get lastLogin for session validation
    })
    
    // Clear cookies if user not found (deleted account)
    if (!user) {
      const cleared = clearAuthCookie()
      const clearedRefresh = clearRefreshCookie()
      return json(
        { ok: false, error: 'Invalid refresh token' },
        { status: 401, headers: { 'set-cookie': [cleared, clearedRefresh] } }
      )
    }

    // Prune revoked tokens older than retention window for this user
    const cutoff = envHelpers.getRevokedPruneCutoffDate()
    await prisma.refreshToken.deleteMany({ where: { userId: record.userId, revokedAt: { lt: cutoff } } })

    // Rotate refresh token
    const { token: newRaw, tokenHash: newHash } = generateTokenPair(32)
    const newExpires = new Date(Date.now() + envHelpers.getRefreshTtlMs())

    await prisma.$transaction([
      prisma.refreshToken.update({ where: { tokenHash }, data: { revokedAt: new Date(), replacedByTokenHash: newHash } }),
      prisma.refreshToken.create({ data: { userId: user.id, tokenHash: newHash, expiresAt: newExpires } })
    ])

    // Issue new access token cookie and refresh cookie
    // IMPORTANT: Include lastLoginAt for session validation
    const loginTimestamp = user.lastLogin ? new Date(user.lastLogin).getTime() : Date.now()
    const access = signJwt({ 
      sub: user.id, 
      role: user.role,
      lastLoginAt: loginTimestamp  // Maintain session tracking after refresh
    })
    const accessCookie = createAuthCookie({ token: access })
    const refreshCookie = createRefreshCookie({ token: newRaw })

    return json({ ok: true }, { status: 200, headers: { 'set-cookie': [accessCookie, refreshCookie] } })
  } catch (err) {
    console.error('Refresh error:', err)
    // Clear cookies on error
    const cleared = clearAuthCookie()
    const clearedRefresh = clearRefreshCookie()
    return json(
      { ok: false, error: 'Failed to refresh token' },
      { status: 500, headers: { 'set-cookie': [cleared, clearedRefresh] } }
    )
  }
}

export function OPTIONS() { return new Response(null, { status: 204 }) }
