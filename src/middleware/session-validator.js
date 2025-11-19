import prisma from '../lib/prisma.js'

// Validate session: returns false if user logged in from another device
// Compares JWT lastLoginAt with current DB user.lastLogin
export async function isSessionValid(userId, jwtLoginTimestamp) {
  try {
    if (!userId) {
      return false
    }

    // Enforce: If JWT doesn't have lastLoginAt, treat as invalid to prevent parallel sessions
    if (!jwtLoginTimestamp) {
      return false
    }

    // Get user's current lastLogin from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastLogin: true }
    })

    if (!user) {
      return false
    }

    // If user never logged in (shouldn't happen, but handle gracefully)
    if (!user.lastLogin) {
      return true  // Allow access, will be set on next login
    }

    // Compare timestamps (allow 1 second tolerance for race conditions)
    const dbLoginTimestamp = new Date(user.lastLogin).getTime()
    
    // If DB timestamp is newer than JWT, user logged in from another device
    if (dbLoginTimestamp > jwtLoginTimestamp + 1000) {
      return false  // Session invalidated by newer login
    }

    return true
  } catch (error) {
    console.error('Session validation error:', error)
    return false  // Fail-safe: deny access on error
  }
}

// Middleware wrapper for session validation (use in critical endpoints)
// @returns {Promise<Response|null>} - Error response or null if valid
export async function validateSession(payload) {
  if (!payload?.sub || !payload?.lastLoginAt) {
    return {
      error: 'Invalid token',
      status: 401
    }
  }

  const valid = await isSessionValid(payload.sub, payload.lastLoginAt)
  
  if (!valid) {
    return {
      error: 'Session expired. You have logged in from another device.',
      code: 'SESSION_INVALIDATED',
      status: 401
    }
  }

  return null  // Valid session
}

// Quick check for session validation
// @returns {Promise<{valid: boolean, error?: string}>}
export async function quickSessionCheck(payload) {
  return validateSession(payload)
}
