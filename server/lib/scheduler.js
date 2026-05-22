/**
 * server/lib/scheduler.js
 *
 * In-process email scheduler backed by Prisma (PostgreSQL).
 *
 * How scheduling works:
 *   1. /api/schedule-campaign creates Email records in the database with a
 *      future `createdAt` timestamp (used as the "send at" time).
 *   2. scheduleEmail() calls setTimeout() to fire at the right moment.
 *   3. On server startup, rehydrateQueue() re-schedules any emails that were
 *      pending when the server last shut down (survives restarts).
 *   4. markSent() / markFailed() update the database after each send attempt.
 *
 * Limitations:
 *   - setTimeout() is not reliable across restarts longer than the delay.
 *     rehydrateQueue() mitigates this but emails scheduled far in the future
 *     (>24h) will be re-queued on next restart and sent immediately.
 *   - For production at scale, replace setTimeout with a proper job queue
 *     (Bull, BullMQ, or Render Cron Jobs).
 *
 * Exports:
 *   scheduleEmail(opts)   → void   (sets a timer; idempotent per email id)
 *   rehydrateQueue()      → Promise<void>  (called once at server startup)
 */

import { prisma } from './prisma.js'
import { sendViaGraph, sendViaGmail } from './email-sender.js'

// ── Database status updates ───────────────────────────────────────────────────

/**
 * Mark an email record as successfully sent.
 *
 * @param {number} emailId  Prisma Email.id
 */
async function markSent(emailId) {
  await prisma.email.update({
    where: { id: emailId },
    data:  { sentAt: new Date(), failedAt: null, error: null },
  })
}

/**
 * Mark an email record as failed with the error message.
 *
 * @param {number} emailId
 * @param {string} error
 */
async function markFailed(emailId, error) {
  await prisma.email.update({
    where: { id: emailId },
    data:  { failedAt: new Date(), error },
  })
}

// ── Core scheduling ───────────────────────────────────────────────────────────

/**
 * Schedule a single email to be sent at `sendAt` via the specified provider.
 *
 * Uses setTimeout with a delay clamped to 0 (sends immediately if `sendAt`
 * is in the past, which can happen after a server restart).
 *
 * @param {{
 *   id:       number,
 *   to:       string,
 *   subject:  string,
 *   body:     string,
 *   sendAt:   string,   ISO 8601 timestamp
 *   provider: 'outlook'|'gmail',
 *   userId:   string
 * }} opts
 */
export function scheduleEmail({ id, to, subject, body, sendAt, provider = 'outlook', userId = 'friend' }) {
  const delay = Math.max(0, new Date(sendAt).getTime() - Date.now())

  setTimeout(async () => {
    try {
      const sendFn = provider === 'gmail' ? sendViaGmail : sendViaGraph
      await sendFn({ to, subject, body }, userId) // userId passed to both — Graph needs it for DB token lookup
      await markSent(id)
      console.log(`[scheduler] Sent to ${to} via ${provider}`)
    } catch (e) {
      await markFailed(id, e.message)
      console.error(`[scheduler] Failed to ${to} via ${provider}: ${e.message}`)
    }
  }, delay)
}

// ── Server startup: re-queue pending emails ───────────────────────────────────

/**
 * Re-schedule any emails that were pending (not yet sent, not failed) when
 * the server last shut down. Called once during server startup.
 *
 * Emails whose `sendAt` (stored as `createdAt`) is in the past will fire
 * immediately (delay = 0), which is the desired behavior for emails that
 * should have gone out while the server was down.
 */
export async function rehydrateQueue() {
  try {
    const pending = await prisma.email.findMany({
      where: { sentAt: null, failedAt: null },
    })

    if (!pending.length) return

    console.log(`[scheduler] Rehydrating ${pending.length} pending email(s) from database`)

    for (const email of pending) {
      scheduleEmail({
        id:       email.id,
        to:       email.to,
        subject:  email.subject,
        body:     email.body,
        sendAt:   (email.scheduledAt || email.createdAt).toISOString(), // fallback for old rows
        provider: email.provider || 'outlook',
        userId:   email.userId   || 'friend',
      })
    }
  } catch (err) {
    // Non-fatal: log and continue. The server should still start even if the
    // database is temporarily unavailable at boot.
    console.error('[scheduler] Rehydration failed:', err.message)
  }
}
