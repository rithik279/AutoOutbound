/**
 * server/routes/email.js
 *
 * Campaign email scheduling, status, and retry endpoints.
 *
 * Routes:
 *   POST /api/schedule-campaign  — Schedule a batch of emails
 *   GET  /api/schedule-status    — Get sent/pending/failed counts
 *   GET  /api/sent-emails        — List sent email history
 *   POST /api/schedule-retry     — Retry all failed emails
 *
 * Scheduling flow:
 *   1. Client sends an array of { to, subject, body, sendAt, company, contactId }.
 *   2. For each email, the endpoint finds or creates the Contact record.
 *   3. Creates an Email record in the database with the scheduled sendAt time.
 *   4. Calls scheduleEmail() which sets a setTimeout to send at the right moment.
 *
 * Note on transactions:
 *   Contact creation + email creation are not wrapped in a Prisma transaction.
 *   If email creation fails after contact creation, the contact will exist
 *   without an email record. This is acceptable for the current scale — a full
 *   transaction would require Prisma's interactive transactions which add latency.
 */

import { Router }              from 'express'
import { prisma }              from '../lib/prisma.js'
import { scheduleEmailJob }    from '../lib/queue.js'
import { getGraphToken }       from '../lib/tokens.js'
import { getGmailToken }       from '../lib/gmail.js'

const router = Router()

// ── Schedule a new campaign ───────────────────────────────────────────────────

/**
 * POST /api/schedule-campaign
 *
 * Persists and schedules a batch of outbound emails.
 * Verifies the selected provider is authenticated before creating any records.
 *
 * Headers: x-user-id
 * Body: {
 *   emails:   [{ to, subject, body, sendAt, company?, contactId? }],
 *   provider: 'gmail' | 'outlook'
 * }
 * Response: { ok: true, count: number, provider: string }
 */
router.post('/schedule-campaign', async (req, res) => {
  const { emails, provider } = req.body
  const userId = req.userId || req.headers['x-user-id'] || 'friend'

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'Missing or empty emails array' })
  }
  if (!provider) {
    return res.status(400).json({ error: 'Provider required: "gmail" or "outlook"' })
  }
  if (!['gmail', 'outlook'].includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider — must be "gmail" or "outlook"' })
  }

  // Fail fast: verify the provider is authenticated before writing any DB records
  try {
    if (provider === 'gmail') await getGmailToken(userId)
    else                       await getGraphToken()
  } catch (e) {
    return res.status(503).json({ error: `${provider} not authenticated: ${e.message}` })
  }

  try {
    // Concurrency-limited batch — max 10 parallel Prisma writes to avoid pool exhaustion
    const CONCURRENCY = 10
    const newEntries  = []
    for (let i = 0; i < emails.length; i += CONCURRENCY) {
      const chunk = emails.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        chunk.map(async ({ to, subject, body, sendAt, company, contactId }) => {
          const scheduledAt = new Date(sendAt)
          if (isNaN(scheduledAt.getTime())) {
            throw new Error(`Invalid sendAt for email to ${to}: ${sendAt}`)
          }

          // Find or create the contact record so every email has a linked contact
          let contact = await prisma.contact.findUnique({ where: { email: to } })
          if (!contact) {
            contact = await prisma.contact.create({
              data: {
                email:   to,
                name:    to.split('@')[0],
                company: company || 'Unknown',
                state:   'new',
                source:  'campaign',
              },
            })
          }

          return prisma.email.create({
            data: {
              to,
              subject,
              body,
              userId,
              company:     company || null,
              provider,
              contactId:   contact.id,
              scheduledAt, // dedicated column — no longer abusing createdAt
            },
          })
        })
      )
      newEntries.push(...results)
    }

    // Register each email with pg-boss (idempotent — safe to call multiple times)
    for (const email of newEntries) {
      await scheduleEmailJob({
        id:       email.id,
        to:       email.to,
        subject:  email.subject,
        body:     email.body,
        sendAt:   email.scheduledAt.toISOString(),
        provider: email.provider,
        userId:   email.userId,
      })
    }

    console.log(`[email] Scheduled ${newEntries.length} emails via ${provider} for user ${userId}`)
    res.json({ ok: true, count: newEntries.length, provider })
  } catch (err) {
    console.error('[email] schedule-campaign error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Campaign status ───────────────────────────────────────────────────────────

/**
 * GET /api/schedule-status
 *
 * Returns aggregate counts of emails in each state for the current user.
 * Used by the frontend status bar.
 *
 * Response: { total, sent, pending, failed }
 */
router.get('/schedule-status', async (req, res) => {
  const userId = req.userId || req.headers['x-user-id'] || 'friend'
  try {
    const [sent, pending, failed, total] = await Promise.all([
      prisma.email.count({ where: { userId, sentAt:   { not: null } } }),
      prisma.email.count({ where: { userId, sentAt:   null, failedAt: null } }),
      prisma.email.count({ where: { userId, failedAt: { not: null } } }),
      prisma.email.count({ where: { userId } }),
    ])
    res.json({ total, sent, pending, failed })
  } catch (err) {
    console.error('[email] schedule-status error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Sent email history ────────────────────────────────────────────────────────

/**
 * GET /api/sent-emails
 *
 * Returns the full sent history for a user, ordered newest first.
 * Includes failed emails (failed flag = true) so the user can see delivery errors.
 *
 * Response: { emails: [{ id, to, subject, company, sentAt, failed, error }] }
 */
router.get('/sent-emails', async (req, res) => {
  const userId = req.userId || req.headers['x-user-id'] || 'friend'
  try {
    const emails = await prisma.email.findMany({
      where:   { userId, sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
    })
    res.json({
      emails: emails.map(e => ({
        id:      e.id,
        to:      e.to,
        subject: e.subject,
        company: e.company || '',
        sentAt:  e.sentAt,
        failed:  e.failedAt !== null,
        error:   e.error || null,
      })),
    })
  } catch (err) {
    console.error('[email] sent-emails error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Retry failed emails ───────────────────────────────────────────────────────

/**
 * POST /api/schedule-retry
 *
 * Re-schedules all failed emails for the current user, staggered 2 minutes apart.
 * Verifies Outlook auth first (most retries go via Outlook).
 *
 * Response: { ok: true, count: number }
 */
router.post('/schedule-retry', async (req, res) => {
  const userId = req.userId || req.headers['x-user-id'] || 'friend'
  // Verify auth before retrying — if the token is still expired retries will fail again
  try { await getGraphToken(userId) }
  catch (e) { return res.status(503).json({ error: e.message }) }
  try {
    const failed = await prisma.email.findMany({
      where: { userId, failedAt: { not: null } },
    })
    if (!failed.length) return res.json({ ok: true, count: 0 })

    // Stagger retries 2 minutes apart, clear failedAt so pg-boss will accept the job
    for (const [i, email] of failed.entries()) {
      const sendAt = new Date(Date.now() + i * 2 * 60_000).toISOString()
      await prisma.email.update({ where: { id: email.id }, data: { failedAt: null, error: null } })
      await scheduleEmailJob({
        id:       email.id,
        to:       email.to,
        subject:  email.subject,
        body:     email.body,
        sendAt,
        provider: email.provider || 'gmail',
        userId:   email.userId   || 'friend',
      })
    }

    // Clear failed flag on all retried emails
    await prisma.email.updateMany({
      where: { userId, failedAt: { not: null } },
      data:  { failedAt: null, error: null },
    })

    console.log(`[email] Retrying ${failed.length} failed emails for user ${userId}`)
    res.json({ ok: true, count: failed.length })
  } catch (err) {
    console.error('[email] schedule-retry error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
