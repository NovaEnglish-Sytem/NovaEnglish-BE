const stores = new Map()

function now() {
  return Date.now()
}

function getClientIp(req) {
  const xff = req.headers.get('x-forwarded-for') || ''
  if (xff) {
    const ip = xff.split(',')[0].trim()
    if (ip) return ip
  }
  const cf = req.headers.get('cf-connecting-ip') || ''
  if (cf) return cf
  const xr = req.headers.get('x-real-ip') || ''
  if (xr) return xr

  return 'unknown'
}

export function rateLimit({ windowMs = 60_000, max = 10, name = 'default' } = {}) {
  return {
    check(request) {
      const ip = getClientIp(request)
      const nowTs = now()
      const windowKey = `${name}:${Math.floor(nowTs / windowMs)}`

      if (!stores.has(windowKey)) {
        stores.set(windowKey, new Map())
        for (const key of stores.keys()) {
          const [prefix, ts] = key.split(':')
          if (prefix !== name) continue
          const windowStart = Number(ts) * windowMs
          if (nowTs - windowStart > windowMs * 3) {
            stores.delete(key)
          }
        }
      }

      const bucket = stores.get(windowKey)
      const rec = bucket.get(ip) || { count: 0, reset: Math.ceil((Math.floor(nowTs / windowMs) + 1) * windowMs) }
      rec.count += 1
      bucket.set(ip, rec)

      const remaining = Math.max(0, max - rec.count)
      const ok = rec.count <= max

      return {
        ok,
        remaining,
        reset: rec.reset,
        headers: {
          'x-ratelimit-limit': String(max),
          'x-ratelimit-remaining': String(remaining),
          'x-ratelimit-reset': String(Math.ceil(rec.reset / 1000)),
        },
      }
    },
  }
}
