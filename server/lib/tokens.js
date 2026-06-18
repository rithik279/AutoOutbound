/**
 * server/lib/tokens.js
 *
 * Outlook / Microsoft Graph OAuth token management.
 * Tokens are stored in the User.outlookTokens JSON column (PostgreSQL)
 * instead of .tokens.json — survives server restarts and Render deploys.
 *
 * Exports:
 *   getOutlookTokenHealth(userId)  → Promise<{ status, minutesLeft }>
 *   logTokenHealth()               → Promise<void>
 *   getGraphToken(userId)          → Promise<string>  (auto-refresh)
 *   saveOutlookTokens(userId, t)   → Promise<void>
 */

import fetch   from 'node-fetch'
import { OUTLOOK } from './config.js'
import { prisma, resolveUserId }  from './prisma.js'

// ── Token health ──────────────────────────────────────────────────────────────

export async function getOutlookTokenHealth(userId) {
  try {
    const id = await resolveUserId(userId)
    if (!id) return { status: 'missing', minutesLeft: 0 }
    const user = await prisma.user.findUnique({ where: { id }, select: { outlookTokens: true } })
    const t = user?.outlookTokens
    if (!t) return { status: 'missing', minutesLeft: 0 }
    const msLeft     = t.expiresAt - Date.now()
    const minutesLeft = Math.round(msLeft / 60_000)
    if (msLeft < 0)            return { status: 'expired',  minutesLeft: 0 }
    if (msLeft < 10 * 60_000)  return { status: 'critical', minutesLeft }
    if (msLeft < 30 * 60_000)  return { status: 'warning',  minutesLeft }
    return { status: 'ok', minutesLeft }
  } catch {
    return { status: 'error', minutesLeft: 0 }
  }
}

// Legacy: check any user has a valid token (used by status bar in old code)
export async function getTokenHealth(userId) {
  return getOutlookTokenHealth(userId || 'friend')
}

export async function logTokenHealth() {
  // Check all users with outlook tokens
  const users = await prisma.user.findMany({ where: { outlookTokens: { not: null } }, select: { id: true, outlookTokens: true } })
  for (const u of users) {
    const h = await getOutlookTokenHealth(u.id)
    if      (h.status === 'expired')  console.error(`[TOKEN] OUTLOOK EXPIRED for ${u.id} — user must re-authorize`)
    else if (h.status === 'critical') console.warn(`[TOKEN] OUTLOOK CRITICAL for ${u.id} — expires in ${h.minutesLeft}min`)
  }
}

// ── Save tokens ───────────────────────────────────────────────────────────────

export async function saveOutlookTokens(userId, tokenData) {
  const id = await resolveUserId(userId)
  if (!id) throw new Error(`saveOutlookTokens: no user for "${userId}"`)
  await prisma.user.update({
    where:  { id },
    data:   { outlookTokens: tokenData, emailProvider: 'outlook' },
  })
}

// ── Token retrieval with auto-refresh ─────────────────────────────────────────

export async function getGraphToken(userId) {
  if (!userId) throw new Error('userId required for getGraphToken')

  const id = await resolveUserId(userId)
  if (!id) throw new Error('Outlook not authorized — connect your Outlook account in Settings')
  const user = await prisma.user.findUnique({ where: { id }, select: { outlookTokens: true } })
  const t = user?.outlookTokens
  if (!t?.accessToken) {
    throw new Error('Outlook not authorized — connect your Outlook account in Settings')
  }

  // Auto-refresh if within 5 minutes of expiry
  if (t.expiresAt - Date.now() < 5 * 60_000) {
    console.log(`[TOKEN] Refreshing Outlook token for ${userId}…`)
    // Use /consumers/ to match the authorization flow (auth.js) — personal
    // Microsoft account refresh tokens are bound to that authority and fail
    // to refresh against /common/.
    const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     OUTLOOK.clientId || t.clientId,
        client_secret: OUTLOOK.clientSecret,
        grant_type:    'refresh_token',
        refresh_token: t.refreshToken,
        scope:         'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite offline_access',
      }),
    })
    const data = await res.json()
    if (!data.access_token) {
      throw new Error(`Outlook token refresh failed (${data.error || 'unknown'}: ${data.error_description?.split('\n')[0] || ''}) — re-authorize in Settings`)
    }
    const updated = {
      ...t,
      accessToken:  data.access_token,
      refreshToken: data.refresh_token || t.refreshToken,
      expiresAt:    Date.now() + data.expires_in * 1000,
    }
    await saveOutlookTokens(userId, updated)
    console.log(`[TOKEN] Outlook refreshed for ${userId}`)
    return updated.accessToken
  }

  return t.accessToken
}
