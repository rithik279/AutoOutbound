/**
 * server/lib/gmail.js
 *
 * Gmail OAuth token management and email sending via the Gmail REST API.
 * Tokens are stored in the User.gmailTokens JSON column (PostgreSQL)
 * instead of gmail_tokens_<userId>.json files — survives deploys.
 *
 * Exports:
 *   getGmailTokenHealth(userId)  → Promise<{ status, minutesLeft }>
 *   getGmailToken(userId)        → Promise<string>  (access token, auto-refresh)
 *   saveGmailTokens(userId, t)   → Promise<void>
 *   sendViaGmail(opts, userId)   → Promise<void>
 */

import fetch  from 'node-fetch'
import { GMAIL } from './config.js'
import { prisma, resolveUserId } from './prisma.js'
import { buildTrackedHtml } from './email-tracking.js'

// ── Token health ──────────────────────────────────────────────────────────────

export async function getGmailTokenHealth(userId) {
  try {
    const id = await resolveUserId(userId)
    if (!id) return { status: 'missing', minutesLeft: 0 }
    const user = await prisma.user.findUnique({ where: { id }, select: { gmailTokens: true } })
    const t = user?.gmailTokens
    if (!t) return { status: 'missing', minutesLeft: 0 }
    const msLeft      = t.expiresAt - Date.now()
    const minutesLeft = Math.round(msLeft / 60_000)
    if (msLeft < 0)            return { status: 'expired',  minutesLeft: 0 }
    if (msLeft < 10 * 60_000)  return { status: 'critical', minutesLeft }
    if (msLeft < 30 * 60_000)  return { status: 'warning',  minutesLeft }
    return { status: 'ok', minutesLeft }
  } catch {
    return { status: 'error', minutesLeft: 0 }
  }
}

// ── Save tokens ───────────────────────────────────────────────────────────────

export async function saveGmailTokens(userId, tokenData) {
  const id = await resolveUserId(userId)
  if (!id) throw new Error(`saveGmailTokens: no user for "${userId}"`)
  await prisma.user.update({
    where: { id },
    data:  { gmailTokens: tokenData, emailProvider: 'gmail' },
  })
}

// ── Token retrieval with auto-refresh ─────────────────────────────────────────

export async function getGmailToken(userId) {
  const id = await resolveUserId(userId)
  if (!id) throw new Error('Gmail not authorized — connect your Gmail account in Settings')
  const user = await prisma.user.findUnique({ where: { id }, select: { gmailTokens: true } })
  const t    = user?.gmailTokens

  if (!t?.accessToken) {
    throw new Error('Gmail not authorized — connect your Gmail account in Settings')
  }

  // Auto-refresh if within 5 minutes of expiry
  if (t.expiresAt - Date.now() < 5 * 60_000) {
    console.log(`[GMAIL] Refreshing token for ${userId}…`)
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
    if (!data.access_token) {
      throw new Error('Gmail token refresh failed — re-authorize in Settings')
    }
    const updated = {
      ...t,
      accessToken: data.access_token,
      // Google doesn't always return a new refresh_token — keep the old one
      refreshToken: data.refresh_token || t.refreshToken,
      expiresAt:    Date.now() + (data.expires_in || 3600) * 1000,
    }
    await saveGmailTokens(userId, updated)
    console.log(`[GMAIL] Token refreshed for ${userId}`)
    return updated.accessToken
  }

  return t.accessToken
}

// ── Send email via Gmail REST API ─────────────────────────────────────────────

export async function sendViaGmail({ to, subject, body, trackingId }, userId) {
  const accessToken = await getGmailToken(userId)

  // Build RFC 2822 message
  const id   = await resolveUserId(userId)
  const user = await prisma.user.findUnique({ where: { id }, select: { senderName: true, senderEmail: true } })
  const from = user?.senderEmail
    ? `${user.senderName || ''} <${user.senderEmail}>`.trim()
    : 'me'

  // Build tracked HTML if we have a trackingId, otherwise fall back to plain text
  const htmlBody   = trackingId ? buildTrackedHtml(body, trackingId) : null
  const boundary   = `boundary_${Date.now()}`

  // Multipart/alternative: plain text + HTML (email clients show HTML if supported)
  const messageParts = htmlBody
    ? [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        htmlBody,
        '',
        `--${boundary}--`,
      ]
    : [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ]

  const message = messageParts.join('\r\n')

  const encoded = Buffer.from(message).toString('base64url')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(`Gmail send failed: ${JSON.stringify(err)}`)
  }

  // Return message + thread IDs so the caller can store them for reply detection
  const sent = await res.json().catch(() => ({}))
  return { gmailMessageId: sent.id || null, gmailThreadId: sent.threadId || null }
}
