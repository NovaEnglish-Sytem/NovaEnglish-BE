import { z } from 'zod'
import { readJsonBody } from '../utils/http.js'

function formatZodError(err) {
  try {
    const issues = err?.issues?.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
      code: i.code,
    })) ?? []
    return { message: 'Validation failed', issues }
  } catch {
    return { message: 'Validation failed' }
  }
}

export async function validateJson(request, schema, { failOnInvalidJson = true } = {}) {
  try {
    const body = await readJsonBody(request, { failOnError: failOnInvalidJson })
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      const error = formatZodError(parsed.error)
      return {
        ok: false,
        error,
        response: new Response(JSON.stringify({ ok: false, error: 'VALIDATION_ERROR', ...error }), {
          status: 400,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
      }
    }
    return { ok: true, data: parsed.data }
  } catch (e) {
    const error = { message: 'Invalid JSON body' }
    return {
      ok: false,
      error,
      response: new Response(JSON.stringify({ ok: false, error: 'INVALID_JSON', ...error }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    }
  }
}

export function validateQuery(searchParams, schema) {
  // Convert URLSearchParams to plain object
  const query = Object.fromEntries(searchParams.entries())
  const parsed = schema.safeParse(query)
  if (!parsed.success) {
    const error = formatZodError(parsed.error)
    return {
      ok: false,
      error,
      response: new Response(JSON.stringify({ ok: false, error: 'VALIDATION_ERROR', ...error }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    }
  }
  return { ok: true, data: parsed.data }
}

// Common schemas (optional helpers)
export const common = {
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(200),
  role: z.enum(['STUDENT', 'TUTOR', 'ADMIN']),
}