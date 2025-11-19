import prisma from '../lib/prisma.js'
import { getJwtFromRequest, verifyJwt } from '../lib/auth.js'
import { sendError } from '../utils/http.js'
import crypto from 'crypto'

// @returns {Promise<{hasSession: boolean, session: object|null}>}
export async function getActiveSession(studentId) {
  try {
    // CRITICAL FIX: Add orderBy to get LATEST session (most recent activity)
    // Without ordering, findFirst returns random session if multiple exist
    const session = await prisma.activeTestSession.findFirst({
      where: {
        studentId,
        expiresAt: { gt: new Date() },
        // Also ensure attempt is not completed (safety check)
        attempt: {
          completedAt: null
        }
      },
      // No includes: removed legacy relations to prevent Prisma errors
      orderBy: {
        lastActivity: 'desc'
      }
    })

    return {
      hasSession: !!session,
      session
    }
  } catch (error) {
    console.error('Error checking active session:', error)
    return { hasSession: false, session: null }
  }
}

export async function validateSessionToken(attemptId, sessionToken, studentId) {
  try {
    const session = await prisma.activeTestSession.findFirst({
      where: {
        attemptId,
        studentId,
        sessionToken,
        expiresAt: { gt: new Date() }
      }
    })

    return !!session
  } catch (error) {
    console.error('Error validating session token:', error)
    return false
  }
}

export async function updateSessionActivity(attemptId) {
  try {
    // Use updateMany to make it idempotent - won't fail if session doesn't exist
    await prisma.activeTestSession.updateMany({
      where: { attemptId },
      data: { lastActivity: new Date() }
    })
  } catch (error) {
    console.error('Error updating session activity:', error)
  }
}

// Middleware: Enforce session guard for test routes
export async function enforceSessionGuard(request, attemptId) {
  const token = getJwtFromRequest(request)
  if (!token) return { valid: false, error: sendError('Not authenticated', 401) }

  const payload = verifyJwt(token)
  if (!payload?.sub) return { valid: false, error: sendError('Invalid token', 401) }

  const studentId = String(payload.sub)

  // Get active session
  const { hasSession, session } = await getActiveSession(studentId)

  // If no active session, deny access (test must be started via /api/test/start)
  if (!hasSession) {
    return {
      valid: false,
      error: sendError('No active test session found', 403),
      shouldRedirect: true,
      redirectTo: '/dashboard'
    }
  }

  // If accessing wrong attemptId, redirect to active test
  if (attemptId && session.attemptId !== attemptId) {
    return {
      valid: false,
      error: sendError('Another test is in progress', 403),
      shouldRedirect: true,
      redirectTo: `/test/${session.attemptId}`,
      activeAttemptId: session.attemptId
    }
  }

  // Validate session token if provided
  const sessionToken = request.headers.get('x-session-token')
  if (sessionToken) {
    const isValid = await validateSessionToken(session.attemptId, sessionToken, studentId)
    if (!isValid) {
      return {
        valid: false,
        error: sendError('Invalid session token', 403, { reason: 'invalid_token' })
      }
    }
  }

  // Update activity timestamp
  await updateSessionActivity(session.attemptId)

  return {
    valid: true,
    studentId,
    session
  }
}

export function generateSessionToken() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return crypto.randomBytes(32).toString('hex')
}
