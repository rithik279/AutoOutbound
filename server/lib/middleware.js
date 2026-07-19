/**
 * server/lib/middleware.js
 *
 * Shared Express middleware:
 *   - requireAuth    — verify the Clerk session token (Authorization: Bearer)
 *   - loginLimiter   — rate-limit login/signup to 10 req/min per IP
 *   - aiLimiter      — rate-limit AI proxy to 30 req/min per user
 *   - isPrivateIP    — block SSRF to private/loopback ranges
 */

import { createClerkClient, verifyToken as clerkVerifyToken } from '@clerk/backend'
import { prisma } from './prisma.js'

const clerk = process.env.CLERK_SECRET_KEY
  ? createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  : null

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || ''

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
  keyFn:    req => `ai:${req.userId || req.ip}`,
  message:  'AI rate limit exceeded — try again in a minute.',
})

/** 60 Apollo calls per user per minute (protects credit budget) */
export const apolloLimiter = makeRateLimiter({
  windowMs: 60_000,
  max:      60,
  keyFn:    req => `apollo:${req.userId || req.ip}`,
  message:  'Apollo rate limit exceeded.',
})

// ── Auth middleware ───────────────────────────────────────────────────────────

/**
 * requireAuth — verify the Clerk session JWT from the Authorization header
 * and resolve it to a local user record (auto-provisioning on first login).
 * Requests without a valid token are rejected; there is no header fallback.
 */
export async function requireAuth(req, res, next) {
  // ── Clerk JWT path (preferred) ───────────────────────────────────────────
  const bearerToken = req.headers.authorization?.replace('Bearer ', '')

  if (bearerToken && clerk) {
    try {
      const payload = await clerkVerifyToken(bearerToken, {
        secretKey: CLERK_SECRET_KEY,
        authorizedParties: [
          'https://auto-outbound.rithiksingh.com',
          'https://firstshot.rithiksingh.com',
          'http://localhost:5173',
          'http://localhost:3000',
        ],
      })
      const clerkId = payload.sub

      // Find existing user by clerkId
      let user = await prisma.user.findUnique({ where: { clerkId } })

      if (!user) {
        // First Clerk login — match by email or auto-provision
        const clerkUser = await clerk.users.getUser(clerkId)
        const email = clerkUser.emailAddresses?.[0]?.emailAddress || ''
        const name  = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')

        // Try to link to existing account by email
        user = await prisma.user.findUnique({ where: { email } })
        if (user) {
          // Link existing account to Clerk
          user = await prisma.user.update({ where: { id: user.id }, data: { clerkId } })
        } else {
          // Brand new user — provision
          const userId = `${email.split('@')[0] || 'user'}-${Date.now().toString(36)}`
          user = await prisma.user.create({
            data: {
              id: userId, clerkId, email,
              name, senderName: name, senderEmail: email,
              modelId: 'gpt-4o-mini', campaignMode: 'startup', emailProvider: 'gmail',
            },
          })
        }
      }

      req.userId   = user.id
      req.clerkId  = clerkId
      return next()
    } catch (e) {
      console.error('[auth] Clerk verifyToken failed:', e?.message || e)
      return res.status(401).json({ error: 'Invalid session token' })
    }
  }

  // No verified Clerk session — reject. The old x-user-id fallback trusted a
  // client-supplied header with no verification, letting anyone act as any
  // user whose ID they knew; it is intentionally gone.
  return res.status(401).json({ error: 'Unauthorized — please log in again.' })
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

/** True if a literal IP address (v4 or v6) is private/loopback/link-local. */
function isPrivateAddress(addr) {
  const a = String(addr).toLowerCase().replace(/^\[|\]$/g, '')
  if (a.includes(':')) {
    if (a.startsWith('::ffff:')) return isPrivateAddress(a.slice(7))
    return a === '::1' || a === '::' || a.startsWith('fe80') || a.startsWith('fc') || a.startsWith('fd')
  }
  const parts = a.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [p1, p2] = parts
  return (
    p1 === 0 || p1 === 10 || p1 === 127 ||
    (p1 === 100 && p2 >= 64 && p2 <= 127) ||
    (p1 === 169 && p2 === 254) ||
    (p1 === 172 && p2 >= 16 && p2 <= 31) ||
    (p1 === 192 && p2 === 168)
  )
}

/**
 * Resolve a hostname and throw if it (or any of its addresses) is private.
 * Complements validateOutboundUrl, which only pattern-matches the hostname
 * string — a public-looking domain can still have an A record pointing at
 * 127.0.0.1 or the cloud metadata service.
 */
export async function assertPublicHost(hostname) {
  const host = String(hostname).replace(/^\[|\]$/g, '')
  if (PRIVATE_IP_RE.test(host)) throw new Error('Private/loopback host not allowed')

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    if (isPrivateAddress(host)) throw new Error('Private IP address not allowed')
    return
  }

  const { lookup } = await import('dns/promises')
  const addrs = await lookup(host, { all: true, verbatim: true })
  if (!addrs.length) throw new Error(`Could not resolve ${host}`)
  for (const { address } of addrs) {
    if (isPrivateAddress(address)) {
      throw new Error(`Host ${host} resolves to a private address`)
    }
  }
}
