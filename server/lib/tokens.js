/**
 * server/lib/tokens.js
 *
 * Outlook / Microsoft Graph OAuth token management.
 *
 * Tokens are stored in .tokens.json at the repo root (gitignored).
 * The file is written by:
 *   - scripts/authorize.js  (one-time setup via CLI)
 *   - /api/auth-callback    (production OAuth callback)
 *   - getGraphToken()       (auto-refresh when near expiry)
 *
 * Token lifecycle:
 *   1. Tokens expire after ~1 hour (Microsoft default).
 *   2. getGraphToken() checks expiry before every send and auto-refreshes
 *      using the stored refresh_token when within 5 minutes of expiry.
 *   3. A background interval logs health warnings every 10 minutes so
 *      expiry issues are visible in server logs before sends fail.
 *
 * Exports:
 *   getTokenHealth()  → { status: 'ok'|'warning'|'critical'|'expired'|'missing'|'error', minutesLeft: number }
 *   logTokenHealth()  → void   (logs to console; call on interval)
 *   getGraphToken()   → Promise<string>  (access token, auto-refreshed)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import fetch from 'node-fetch'
import { TOKENS_PATH, OUTLOOK } from './config.js'

// ── Health check ──────────────────────────────────────────────────────────────

/**
 * Returns the current health of the stored Outlook access token.
 *
 * Status levels:
 *   'ok'       → more than 30 minutes remaining
 *   'warning'  → 10–30 minutes remaining (log a warning)
 *   'critical' → < 10 minutes remaining  (send will likely fail)
 *   'expired'  → token has already expired
 *   'missing'  → token file doesn't exist (never authorized)
 *   'error'    → token file exists but couldn't be parsed
 *
 * @returns {{ status: string, minutesLeft: number }}
 */
export function getTokenHealth() {
  if (!existsSync(TOKENS_PATH)) return { status: 'missing', minutesLeft: 0 }
  try {
    const t = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'))
    const msLeft     = t.expiresAt - Date.now()
    const minutesLeft = Math.round(msLeft / 60_000)
    if (msLeft < 0)           return { status: 'expired',  minutesLeft: 0 }
    if (msLeft < 10 * 60_000) return { status: 'critical', minutesLeft }
    if (msLeft < 30 * 60_000) return { status: 'warning',  minutesLeft }
    return { status: 'ok', minutesLeft }
  } catch {
    return { status: 'error', minutesLeft: 0 }
  }
}

/**
 * Logs a human-readable token health message to the console.
 * Called by the background interval in server.js every 10 minutes.
 */
export function logTokenHealth() {
  const h = getTokenHealth()
  const hint = `Run: node scripts/authorize.js ${OUTLOOK.clientId}`
  if      (h.status === 'expired')  console.error(`\n[TOKEN] EXPIRED — scheduled sends will fail. ${hint}\n`)
  else if (h.status === 'critical') console.warn(`[TOKEN] CRITICAL — expires in ${h.minutesLeft}min. ${hint}`)
  else if (h.status === 'warning')  console.warn(`[TOKEN] Warning — expires in ${h.minutesLeft}min`)
}

// ── Token retrieval with auto-refresh ─────────────────────────────────────────

/**
 * Returns a valid Microsoft Graph access token, refreshing it automatically
 * if it will expire within the next 5 minutes.
 *
 * Throws with a human-readable message if the token is missing or refresh fails
 * so the caller can surface this as a 503 to the client.
 *
 * @returns {Promise<string>} access token
 * @throws {Error} if not authorized or refresh fails
 */
export async function getGraphToken() {
  logTokenHealth()

  if (!existsSync(TOKENS_PATH)) {
    throw new Error('Outlook not authorized — run: node scripts/authorize.js <CLIENT_ID>')
  }

  const t = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'))
  if (!t.accessToken) {
    throw new Error('Invalid Outlook token file — run: node scripts/authorize.js <CLIENT_ID>')
  }

  // Auto-refresh if within 5 minutes of expiry
  if (t.expiresAt - Date.now() < 5 * 60_000) {
    console.log('[TOKEN] Refreshing Outlook access token…')
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     t.clientId,
        grant_type:    'refresh_token',
        refresh_token: t.refreshToken,
        scope:         'https://graph.microsoft.com/Mail.Send offline_access',
      }),
    })
    const data = await res.json()
    if (!data.access_token) {
      throw new Error('Outlook token refresh failed — re-run: node scripts/authorize.js <CLIENT_ID>')
    }
    t.accessToken  = data.access_token
    t.refreshToken = data.refresh_token || t.refreshToken
    t.expiresAt    = Date.now() + data.expires_in * 1000
    writeFileSync(TOKENS_PATH, JSON.stringify(t, null, 2))
    console.log('[TOKEN] Outlook token refreshed successfully')
  }

  return t.accessToken
}
