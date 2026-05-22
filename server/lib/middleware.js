/**
 * server/lib/middleware.js
 *
 * Shared Express middleware:
 *   - requireAuth    — verify x-user-id header against known users
 *   - loginLimiter   — rate-limit login/signup to 10 req/min per IP
 *   - aiLimiter      — rate-limit AI proxy to 30 req/min per user
 *   - isPrivateIP    — block SSRF to private/loopback ranges
 */

import { loadUsers } from './users.js'

// ── Simple in-memory rate limiter ────────────────────────────────────────────
// Keyed by `${ip}:${route}`. Good enough for single-process; replace with
// Redis for multi-instance deployments.

const rateBuckets = new Map()

function makeRateLimiter({ windowMs, max, keyFn, message }) {
  return (req, res, next) => {
    const key  = keyFn(req)
    const now  = Date.now()
    const data = rateBuckets.get(key) || { count: 0, reset: now + windowMs }

    if (now > data.reset) {
      data.count = 0
      data.reset = now + windowMs
    }

    data.count++
    rateBuckets.set(key, data)

    if (data.count > max) {
      return res.status(429).json({ error: message || 'Too many requests — try again later.' })
    }

    next()
  }
}

// Prune stale entries every 5 minutes so the Map doesn't grow unbounded
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of rateBuckets) {
    if (now > v.reset + 60_000) rateBuckets.delete(k)
  }
}, 5 * 60_000)

/** 10 login/signup attempts per IP per minute */
export const loginLimiter = makeRateLimiter({
  windowMs: 60_000,
  max:      10,
  keyFn:    req => `login:${req.ip}`,
  message:  'Too many login attempts — wait a minute and try again.',
})

/** 30 AI calls per user per minute */
export const aiLimiter = makeRateLimiter({
  windowMs: 60_000,
  max:      30,
  keyFn:    req => `ai:${req.headers['x-user-id'] || req.ip}`,
  message:  'AI rate limit exceeded — try again in a minute.',
})

/** 60 Apollo calls per user per minute (protects credit budget) */
export const apolloLimiter = makeRateLimiter({
  windowMs: 60_000,
  max:      60,
  keyFn:    req => `apollo:${req.headers['x-user-id'] || req.ip}`,
  message:  'Apollo rate limit exceeded.',
})

// ── Auth middleware ───────────────────────────────────────────────────────────

/**
 * requireAuth — verify that x-user-id header refers to an existing user.
 *
 * This is a lightweight check. For higher security, replace localStorage
 * userId with a signed JWT and verify the signature here instead.
 *
 * Skips auth for /api/user/login and /api/user/signup (handled separately).
 */
export function requireAuth(req, res, next) {
  const userId = req.headers['x-user-id']
  if (!userId) {
    return res.status(401).json({ error: 'Missing x-user-id header' })
  }

  const users = loadUsers()
  if (!users[userId]) {
    return res.status(401).json({ error: 'Unknown user — please log in again.' })
  }

  // Attach to request for downstream use
  req.userId = userId
  next()
}

// ── SSRF protection ───────────────────────────────────────────────────────────

const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fc00:|fd|localhost)/i

/**
 * Validate a URL for use in server-side outbound requests.
 * Blocks private IPs, loopback, and link-local ranges to prevent SSRF.
 *
 * @param {string} url
 * @returns {{ safe: boolean, reason?: string, normalised?: string }}
 */
export function validateOutboundUrl(url) {
  if (!url || typeof url !== 'string') {
    return { safe: false, reason: 'Missing url' }
  }

  let parsed
  try {
    // Strip bare domain input (no protocol) before parsing
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`
    parsed = new URL(withProto)
  } catch {
    return { safe: false, reason: 'Invalid URL' }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { safe: false, reason: 'Only http/https allowed' }
  }

  if (PRIVATE_IP_RE.test(parsed.hostname)) {
    return { safe: false, reason: 'Private/loopback addresses not allowed' }
  }

  // Block numeric IPs that resolve to private ranges (best-effort)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
    if (PRIVATE_IP_RE.test(parsed.hostname)) {
      return { safe: false, reason: 'Private IP address not allowed' }
    }
  }

  return { safe: true, normalised: parsed.hostname }
}
