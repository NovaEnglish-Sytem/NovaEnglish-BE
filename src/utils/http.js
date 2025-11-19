const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  pragma: 'no-cache',
  expires: '0',
  'surrogate-control': 'no-store',
}

export function json(data, init = 200, extraHeaders = {}) {
  const status = typeof init === 'number' ? init : init?.status ?? 200
  const headersInit = typeof init === 'number' ? {} : init?.headers ?? {}
  const base = { ...JSON_HEADERS, ...headersInit }

  const h = new Headers(base)
  if (extraHeaders && typeof extraHeaders === 'object') {
    for (const [k, v] of Object.entries(extraHeaders)) {
      if (k.toLowerCase() === 'set-cookie') {
        const vals = Array.isArray(v) ? v : [v]
        for (const val of vals) {
          if (val) h.append('set-cookie', String(val))
        }
      } else if (v !== undefined && v !== null) {
        h.set(k, String(v))
      }
    }
  }

  return new Response(JSON.stringify(data), { status, headers: h })
}

export async function readJsonBody(request, opts = {}) {
  try {
    const text = await request.text()
    if (!text) return {}
    return JSON.parse(text)
  } catch {
    if (opts.failOnError) {
      throw new Error('Invalid JSON body')
    }
    return {}
  }
}

export function ok(data = {}) {
  return json({ ok: true, ...data }, 200)
}

export function created(data = {}) {
  return json({ ok: true, ...data }, 201)
}

export function noContent() {
  return new Response(null, { status: 204, headers: { ...JSON_HEADERS } })
}

export function badRequest(message = 'Bad Request', details = undefined) {
  return json({ ok: false, error: 'BAD_REQUEST', message, details }, 400)
}

export function unauthorized(message = 'Unauthorized') {
  return json({ ok: false, error: 'UNAUTHORIZED', message }, 401)
}

export function forbidden(message = 'Forbidden') {
  return json({ ok: false, error: 'FORBIDDEN', message }, 403)
}

export function notFound(message = 'Not Found') {
  return json({ ok: false, error: 'NOT_FOUND', message }, 404)
}

export function conflict(message = 'Conflict') {
  return json({ ok: false, error: 'CONFLICT', message }, 409)
}

export function tooManyRequests(message = 'Too Many Requests') {
  return json({ ok: false, error: 'TOO_MANY_REQUESTS', message }, 429)
}

export function methodNotAllowed(method) {
  return json({ ok: false, error: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed` }, 405, {
    Allow: 'GET, POST, PATCH',
  })
}

export function serverError(message = 'Internal Server Error', details = undefined) {
  return json({ ok: false, error: 'INTERNAL_SERVER_ERROR', message, details }, 500)
}

function statusToErrorCode(status) {
  switch (status) {
    case 400: return 'BAD_REQUEST'
    case 401: return 'UNAUTHORIZED'
    case 403: return 'FORBIDDEN'
    case 404: return 'NOT_FOUND'
    case 405: return 'METHOD_NOT_ALLOWED'
    case 409: return 'CONFLICT'
    case 429: return 'TOO_MANY_REQUESTS'
    case 500: return 'INTERNAL_SERVER_ERROR'
    default:  return 'ERROR'
  }
}

export function sendSuccess(data = {}, status = 200) {
  return json({ ok: true, ...data }, status)
}

export function sendError(message = 'Error', status = 500, extraData = {}) {
  const payload = typeof message === 'string'
    ? { ok: false, error: statusToErrorCode(status), message, ...extraData }
    : { ok: false, ...message }
  return json(payload, status)
}
