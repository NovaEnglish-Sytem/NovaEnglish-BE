import prisma from '../../../../src/lib/prisma.js'
import { json } from '../../../../src/utils/http.js'
import { getRefreshFromRequest, clearAuthCookie, clearRefreshCookie } from '../../../../src/lib/auth.js'
import { sha256Hex } from '../../../../src/utils/tokens.js'

export async function POST(request) {
  try {
    // Revoke current refresh token if present
    const raw = getRefreshFromRequest(request)
    if (raw) {
      const tokenHash = sha256Hex(raw)
      try {
        await prisma.refreshToken.update({
          where: { tokenHash },
          data: { revokedAt: new Date() }
        })
      } catch {
        // ignore if token not found
      }
    }

    const cookie = clearAuthCookie()
    const refresh = clearRefreshCookie()
    return json(
      { ok: true, message: 'Logged out' },
      { status: 200, headers: { 'set-cookie': [cookie, refresh] } }
    )
  } catch (err) {
    const cookie = clearAuthCookie()
    const refresh = clearRefreshCookie()
    return json(
      { ok: true, message: 'Logged out' },
      { status: 200, headers: { 'set-cookie': [cookie, refresh] } }
    )
  }
}
