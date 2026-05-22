/**
 * server/lib/gmail.js
 *
 * Gmail OAuth token management and email sending via the Gmail REST API.
 *
 * Token storage:
 *   Each user gets their own token file: gmail_tokens_<userId>.json
 *   These files are gitignored. Tokens are written by /api/gmail/auth-callback.
 *
 * Token lifecycle:
 *   Google access tokens expire after 1 hour. getGmailToken() auto-refreshes
 *   using the stored refresh_token when within 5 minutes of expiry.
 *   A refresh_token is only issued on the first authorization (Google requires
 *   prompt:'consent' to force a new one if the user has already authorized).
 *
 * Exports:
 *   getGmailTokensPath(userId)  → string  (absolute file path)
 *   getGmailTokenHealth(userId) → { status, minutesLeft }
 *   getGmailToken(userId)       → Promise<string>  (access token)
 *   sendViaGmail(opts, userId)  → Promise<void>
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import fetch from 'node-fetch'
import { ROOT, GMAIL } from './config.js'

// ── Token file helpers ────────────────────────────────────────────────────────

/**
 * Returns the absolute path to a user's Gmail token file.
 * Per-user files allow multiple Gmail accounts to be connected simultaneously.
 *
 * @param {string} userId
 * @returns {string}
 */
export function getGmailTokensPath(userId) {
  return join(ROOT, `gmail_tokens_${userId}.json`)
}

/**
 * Returns the current health of a user's Gmail access token.
 * Same status levels as getTokenHealth() in tokens.js.
 *
 * @param {string} userId
 * @returns {{ status: string, minutesLeft: number }}
 */
export function getGmailTokenHealth(userId) {
  const path = getGmailTokensPath(userId)
  if (!existsSync(path)) return { status: 'missing', minutesLeft: 0 }
  try {
    const t          = JSON.parse(readFileSync(path, 'utf8'))
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

// ── Token retrieval with auto-refresh ─────────────────────────────────────────

/**
 * Returns a valid Gmail access token for the given user.
 * Auto-refreshes using the stored refresh_token when within 5 minutes of expiry.
 *
 * @param {string} userId
 * @returns {Promise<string>} access token
 * @throws {Error} if not connected or refresh fails
 */
export async function getGmailToken(userId) {
  const path = getGmailTokensPath(userId)
  if (!existsSync(path)) {
    throw new Error('Gmail not connected — click "Connect Gmail" in Settings → Email Account')
  }

  const t = JSON.parse(readFileSync(path, 'utf8'))
  if (!t.accessToken) throw new Error('Invalid Gmail token — reconnect Gmail in Settings')

  // Auto-refresh when within 5 minutes of expiry
  if (t.expiresAt - Date.now() < 5 * 60_000) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     GMAIL.clientId,
        client_secret: GMAIL.clientSecret,
        grant_type:    'refresh_token',
        refresh_token: t.refreshToken,
      }),
    })
    const data = await res.json()
    if (!data.access_token) throw new Error('Gmail token refresh failed — reconnect Gmail in Settings')
    t.accessToken  = data.access_token
    t.refreshToken = data.refresh_token || t.refreshToken
    t.expiresAt    = Date.now() + data.expires_in * 1000
    writeFileSync(path, JSON.stringify(t, null, 2))
  }

  return t.accessToken
}

// ── Email sending ─────────────────────────────────────────────────────────────

/**
 * Send a plain-text email via the Gmail REST API.
 *
 * Gmail requires the message to be RFC 2822-encoded and base64url-encoded.
 * Note: Unlike Outlook, Gmail does NOT attach the resume automatically —
 * resume attachment via Gmail would require multipart MIME encoding.
 *
 * @param {{ to: string, subject: string, body: string }} opts
 * @param {string} userId  used to look up the stored Gmail token
 * @throws {Error} if the API request fails
 */
export async function sendViaGmail({ to, subject, body }, userId) {
  const token = await getGmailToken(userId)

  // RFC 2822 message format, base64url-encoded as required by the Gmail API
  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  ).toString('base64url')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ raw }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gmail API error ${res.status}`)
  }
}
