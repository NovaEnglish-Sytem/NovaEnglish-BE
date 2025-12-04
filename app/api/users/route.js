import { z } from 'zod'
import prisma from '../../../src/lib/prisma.js'
import { json, unauthorized, forbidden, serverError, badRequest, conflict } from '../../../src/utils/http.js'
import { requireAuthAndSession } from '../../../src/middleware/require-auth.js'
import { env, envHelpers } from '../../../src/lib/env.js'
import { hashPassword } from '../../../src/utils/password.js'
import { generateTokenPair } from '../../../src/utils/tokens.js'
import { sendVerificationEmail } from '../../../src/lib/email.js'

const QuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  role: z.enum(['STUDENT', 'TUTOR', 'ADMIN']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  size: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export async function GET(request) {
  try {
    // Auth + single-device session validation
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return unauthorized(auth.error)
    const { payload } = auth
    if (payload.role !== 'ADMIN') return forbidden('Admin only')

    // Parse query
    const url = new URL(request.url)
    const qp = Object.fromEntries(url.searchParams.entries())
    const parsed = QuerySchema.safeParse(qp)
    if (!parsed.success) {
      // Fallback defaults
      parsed.data = { page: 1, size: 20 }
    }
    const { q, role, page, size } = parsed.data

    const where = {}
    if (role) where.role = role
    if (q && q.length > 0) {
      const qlower = q.toLowerCase()
      where.OR = [
        { email: { contains: qlower, mode: 'insensitive' } },
        { fullName: { contains: qlower, mode: 'insensitive' } },
      ]
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneE164: true,
          role: true,
          isEmailVerified: true,
          placeOfBirth: true,
          dateOfBirth: true,
          gender: true,
          createdAt: true,
        },
      }),
    ])

    return json({
      ok: true,
      users,
      page,
      size,
      total,
      totalPages: Math.ceil(total / size),
    })
  } catch (err) {
    console.error('Users list error:', err)
    return serverError('Failed to list users')
  }
}

export async function POST(request) {
  try {
    // Auth + single-device session validation
    const auth = await requireAuthAndSession(request)
    if (!auth.ok) return unauthorized(auth.error)
    const { payload } = auth
    if (payload.role !== 'ADMIN') return forbidden('Admin only')

    const bodyText = await request.text()
    if (!bodyText) return badRequest('Empty body')
    let body
    try {
      body = JSON.parse(bodyText)
    } catch {
      return badRequest('Invalid JSON body')
    }

    const CreateSchema = z.object({
      email: z.string().email().max(254),
      password: z.string().min(8).max(200),
      fullName: z.string().trim().min(1).max(200),
      role: z.enum(['STUDENT', 'TUTOR', 'ADMIN']).optional().default('STUDENT'),
      phoneE164: z.union([z.string().regex(/^\+[1-9]\d{7,14}$/), z.null()]).optional(),
      isEmailVerified: z.boolean().optional().default(false),
      sendVerificationEmail: z.boolean().optional().default(true),
      placeOfBirth: z.union([z.string().trim().min(1).max(200), z.null()]).optional(),
      dateOfBirth: z.union([z.string().datetime(), z.null()]).optional(),
      gender: z.union([z.string().trim().min(1).max(50), z.null()]).optional(),
    })

    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) return badRequest('Validation failed', parsed.error?.issues)

    const {
      email,
      password,
      fullName,
      role,
      phoneE164,
      isEmailVerified,
      sendVerificationEmail: shouldSend,
      placeOfBirth,
      dateOfBirth,
      gender,
    } = parsed.data

    // Check duplicate
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) return conflict('Email is already registered')

    const passwordHash = await hashPassword(password)
    const normalizedEmail = email.toLowerCase()

    // If admin wants to send verification email for an unverified user,
    // send email first and only then persist user + verification token.
    if (!isEmailVerified && shouldSend) {
      const { token, tokenHash } = generateTokenPair(32)
      const expiresAt = new Date(Date.now() + envHelpers.getVerificationTtlMs())
      const verifyUrl = `${env.appUrl}/account/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}`

      try {
        await sendVerificationEmail({ to: normalizedEmail, verifyUrl })
      } catch (e) {
        if (env.isProd) {
          console.error('Failed to send verification email:', e?.message || e)
        }
        return serverError('Failed to send verification email. Please try again later.')
      }

      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            fullName,
            phoneE164: phoneE164 ?? null,
            role: role ?? 'STUDENT',
            isEmailVerified: false,
            placeOfBirth: placeOfBirth ?? null,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            gender: gender ?? null,
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            phoneE164: true,
            role: true,
            isEmailVerified: true,
            placeOfBirth: true,
            dateOfBirth: true,
            gender: true,
            createdAt: true,
          },
        })

        await tx.verificationToken.create({
          data: { userId: created.id, tokenHash, expiresAt },
        })

        return created
      })

      return json({ ok: true, user }, 201)
    }

    // No verification email requested or user already marked verified: create user directly
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        fullName,
        phoneE164: phoneE164 ?? null,
        role: role ?? 'STUDENT',
        isEmailVerified: !!isEmailVerified,
        placeOfBirth: placeOfBirth ?? null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender ?? null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneE164: true,
        role: true,
        isEmailVerified: true,
        placeOfBirth: true,
        dateOfBirth: true,
        gender: true,
        createdAt: true,
      },
    })

    return json({ ok: true, user }, 201)
  } catch (err) {
    console.error('Admin create user error:', err)
    return serverError('Failed to create user')
  }
}
