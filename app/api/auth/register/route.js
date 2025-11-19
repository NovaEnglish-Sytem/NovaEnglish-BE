import { z } from 'zod'
import prisma from '../../../../src/lib/prisma.js'
import { env, envHelpers } from '../../../../src/lib/env.js'
import { created, badRequest, conflict, serverError } from '../../../../src/utils/http.js'
import { hashPassword } from '../../../../src/utils/password.js'
import { generateTokenPair } from '../../../../src/utils/tokens.js'
import { sendVerificationEmail } from '../../../../src/lib/email.js'
import dns from 'node:dns/promises'

const RegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(200),
  phoneE164: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  role: z.enum(['STUDENT', 'TUTOR', 'ADMIN']).optional(), // default STUDENT
  placeOfBirth: z.string().trim().min(3).max(200),
  dateOfBirth: z.string().min(1),
  gender: z.enum(['MALE', 'FEMALE']),
})

export async function POST(request) {
  try {
    const bodyText = await request.text()
    if (!bodyText) return badRequest('Empty body')
    let body
    try {
      body = JSON.parse(bodyText)
    } catch {
      return badRequest('Invalid JSON body')
    }

    // Coerce gender and ensure DoB age >= 3 years
    const pre = { ...body }
    if (typeof pre.gender === 'string') pre.gender = pre.gender.toUpperCase()
    const parsed = RegisterSchema.safeParse(pre)
    if (!parsed.success) return badRequest('Validation failed', parsed.error?.issues)
    const { email, password, fullName, phoneE164, role, placeOfBirth, dateOfBirth, gender } = parsed.data

    // Age check: must be at least 3 years old
    try {
      const dob = new Date(dateOfBirth)
      const minDate = new Date()
      minDate.setFullYear(minDate.getFullYear() - 3)
      if (dob > minDate) {
        return badRequest('Date of birth must be at least 3 years ago')
      }
    } catch (_) {
      return badRequest('Invalid date of birth')
    }

    // Email deliverability check via MX records
    try {
      const domain = String(email.split('@')[1] || '').trim()
      if (!domain) return badRequest('Invalid email domain')
      const mx = await dns.resolveMx(domain)
      if (!Array.isArray(mx) || mx.length === 0) {
        return badRequest('Email address not found (no MX records)')
      }
    } catch (_) {
      return badRequest('Email address not found (MX lookup failed)')
    }

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) {
      return conflict('Email is already registered')
    }

    const passwordHash = await hashPassword(password)

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        fullName: String(fullName || '').split(/\s+/).map(w => w ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : '').join(' ').trim(),
        phoneE164: phoneE164 ?? null,
        role: role ?? 'STUDENT',
        isEmailVerified: false,
        placeOfBirth: placeOfBirth ? String(placeOfBirth).split(/\s+/).map(w => w ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : '').join(' ').trim() : null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender,
      },
      select: { id: true, email: true },
    })

    // Create verification token
    const { token, tokenHash } = generateTokenPair(32)
    const expiresAt = new Date(Date.now() + envHelpers.getVerificationTtlMs())

    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    })

    // Email link
    const verifyUrl = `${env.appUrl}/account/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`

    // Send email (best-effort)
    try {
      await sendVerificationEmail({ to: user.email, verifyUrl })
    } catch (e) {
      // Do not fail registration on email transport error in dev environments
      if (env.isProd) {
        // In production, you might choose to fail. Here we log and continue.
        console.error('Failed to send verification email:', e?.message || e)
      }
    }

    return created({
      message: 'Registration successful. Please check your email to verify your account.',
    })
  } catch (err) {
    console.error('Register error:', err)
    return serverError('Failed to register')
  }
}
