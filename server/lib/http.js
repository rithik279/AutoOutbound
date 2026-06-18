/**
 * server/lib/http.js
 *
 * Hardened outbound HTTP for all third-party APIs (Microsoft Graph, Gmail,
 * OpenAI/Anthropic, Apollo, company-site fetches).
 *
 * Why this exists:
 *   - node-fetch has NO default timeout — a hung upstream would otherwise hold
 *     a request handler or queue worker open indefinitely (leaking sockets and
 *     pool slots). Every call here is bounded by an AbortController timeout.
 *   - Transient upstream failures (429 / 5xx / network resets) are common at
 *     scale; safe (idempotent) calls are retried with jittered exponential
 *     backoff that honours Retry-After.
 *
 * SAFETY: retries default to 0. NEVER pass retries > 0 to an operation that is
 * not idempotent (e.g. sending an email) — a retried POST can double-send.
 * Read paths, token refreshes, and AI/Apollo calls set retries explicitly.
 */

import fetch from 'node-fetch'

const sleep = ms => new Promise(r => setTimeout(r, ms))

const DEFAULT_RETRY_STATUSES = [429, 500, 502, 503, 504]

/**
 * @param {string} url
 * @param {object} fetchOpts            — passed straight to node-fetch
 * @param {object} [resilience]
 * @param {number} [resilience.timeoutMs=20000]
 * @param {number} [resilience.retries=0]            — additional attempts after the first
 * @param {number[]} [resilience.retryStatuses]      — HTTP statuses that trigger a retry
 * @param {string} [resilience.label]                — for log lines
 * @returns {Promise<import('node-fetch').Response>}
 */
export async function httpFetch(url, fetchOpts = {}, resilience = {}) {
  const {
    timeoutMs     = 20_000,
    retries       = 0,
    retryStatuses = DEFAULT_RETRY_STATUSES,
    label         = 'http',
  } = resilience

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...fetchOpts, signal: controller.signal })
      clearTimeout(timer)

      // Retry on transient status codes (only if attempts remain)
      if (retryStatuses.includes(res.status) && attempt < retries) {
        const wait = retryAfterMs(res) ?? backoffMs(attempt)
        console.warn(`[${label}] ${res.status} from ${hostOf(url)} — retry ${attempt + 1}/${retries} in ${wait}ms`)
        await sleep(wait)
        continue
      }
      return res
    } catch (e) {
      clearTimeout(timer)
      lastErr = e
      const reason = e.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : e.message
      if (attempt < retries) {
        const wait = backoffMs(attempt)
        console.warn(`[${label}] ${reason} (${hostOf(url)}) — retry ${attempt + 1}/${retries} in ${wait}ms`)
        await sleep(wait)
        continue
      }
      // Normalise an abort into a clearer error
      if (e.name === 'AbortError') {
        throw new Error(`Request to ${hostOf(url)} timed out after ${timeoutMs}ms`)
      }
      throw e
    }
  }
  throw lastErr
}

// Jittered exponential backoff: ~0.5s, 1s, 2s … capped at 8s
function backoffMs(attempt) {
  const base = Math.min(8_000, 500 * 2 ** attempt)
  return Math.round(base * (0.5 + Math.random() * 0.5))
}

function retryAfterMs(res) {
  const h = res.headers?.get?.('retry-after')
  if (!h) return null
  const secs = Number(h)
  if (!Number.isNaN(secs)) return Math.min(30_000, secs * 1000)
  const date = Date.parse(h)
  if (!Number.isNaN(date)) return Math.max(0, Math.min(30_000, date - Date.now()))
  return null
}

function hostOf(url) {
  try { return new URL(url).host } catch { return String(url).slice(0, 40) }
}
