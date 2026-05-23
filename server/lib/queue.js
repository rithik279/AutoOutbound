/**
 * server/lib/queue.js
 *
 * pg-boss job queue — replaces the in-process setTimeout scheduler.
 *
 * Why pg-boss over setTimeout?
 *   - Jobs are stored in PostgreSQL — survive server restarts, crashes, deploys
 *   - Each job runs exactly once even if the server crashes mid-send (idempotent)
 *   - Automatic retry with exponential backoff on failure
 *   - No double-send on restart (unlike setTimeout rehydration)
 *   - Free — uses the existing Postgres DB, no extra infrastructure
 *
 * Job types:
 *   'send-email'     — send one scheduled email
 *   'run-discovery'  — run daily prospect discovery for one user
 *
 * Usage:
 *   import { getQueue, scheduleEmailJob, startWorkers } from './queue.js'
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { PgBoss } = require('pg-boss')
import { prisma }        from './prisma.js'
import { sendViaGmail }  from './gmail.js'
import { sendViaGraph }  from './email-sender.js'
import { runDiscovery }  from '../routes/discovery.js'

let boss = null

// ── Singleton init ────────────────────────────────────────────────────────────

export async function getQueue() {
  if (boss) return boss

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL not set — cannot start job queue')

  boss = new PgBoss({
    connectionString: databaseUrl,
    retryLimit:       3,
    retryDelay:       60,        // seconds between retries
    retryBackoff:     true,      // exponential backoff
    expireInHours:    48,        // jobs older than 48h are expired
    deleteAfterDays:  7,         // completed jobs cleaned up after 7 days
    monitorStateIntervalSeconds: 60,
  })

  boss.on('error', e => console.error('[queue] pg-boss error:', e.message))

  await boss.start()
  console.log('[queue] pg-boss started')
  return boss
}

// ── Schedule an email job ─────────────────────────────────────────────────────

/**
 * Schedule a single email to be sent at a specific time.
 * Idempotent — uses the email DB id as the job key; duplicate calls are ignored.
 *
 * @param {{ id: number, to: string, subject: string, body: string, sendAt: string, provider: string, userId: string }} opts
 */
export async function scheduleEmailJob({ id, to, subject, body, sendAt, provider = 'gmail', userId }) {
  const q = await getQueue()

  const startAfter = new Date(sendAt)
  if (isNaN(startAfter.getTime())) {
    throw new Error(`Invalid sendAt for email ${id}: ${sendAt}`)
  }

  // singletonKey ensures the same email is never double-scheduled
  await q.send('send-email', { id, to, subject, body, provider, userId }, {
    startAfter,
    singletonKey: `email-${id}`,
    retryLimit:   3,
    retryDelay:   120,
    retryBackoff: true,
  })
}

// ── Schedule discovery job ─────────────────────────────────────────────────────

/**
 * Schedule a one-off discovery run for a user at a specific time.
 * Called by the daily cron checker.
 *
 * @param {string} userId
 * @param {number} dailyQuota
 */
export async function scheduleDiscoveryJob(userId, dailyQuota) {
  const q = await getQueue()
  await q.send('run-discovery', { userId, dailyQuota }, {
    singletonKey: `discovery-${userId}-${new Date().toISOString().slice(0, 10)}`, // one per day
    retryLimit:   2,
    retryDelay:   300,
  })
}

// ── Start workers ─────────────────────────────────────────────────────────────

/**
 * Register job handlers and start consuming queues.
 * Called once at server startup.
 */
export async function startWorkers() {
  const q = await getQueue()

  // ── Worker: send-email ────────────────────────────────────────────────────
  await q.work('send-email', { teamSize: 5, teamConcurrency: 5 }, async (job) => {
    const { id, to, subject, body, provider, userId } = job.data

    console.log(`[queue] Sending email ${id} to ${to} via ${provider}`)

    try {
      if (provider === 'gmail') {
        await sendViaGmail({ to, subject, body }, userId)
      } else {
        await sendViaGraph({ to, subject, body }, userId)
      }

      // Mark sent in DB
      await prisma.email.update({
        where: { id },
        data:  { sentAt: new Date(), failedAt: null, error: null },
      })

      // Update contact state to 'emailed'
      await prisma.contact.updateMany({
        where: { emails: { some: { id } } },
        data:  { state: 'emailed' },
      })

      console.log(`[queue] ✓ Sent email ${id} to ${to}`)
    } catch (e) {
      console.error(`[queue] ✗ Failed email ${id} to ${to}: ${e.message}`)

      // Mark failed — pg-boss will retry up to retryLimit times
      await prisma.email.update({
        where: { id },
        data:  { failedAt: new Date(), error: e.message },
      })

      // Re-throw so pg-boss knows to retry
      throw e
    }
  })

  // ── Worker: run-discovery ─────────────────────────────────────────────────
  await q.work('run-discovery', { teamSize: 2, teamConcurrency: 1 }, async (job) => {
    const { userId, dailyQuota } = job.data
    console.log(`[queue] Running discovery for ${userId} (quota: ${dailyQuota})`)
    try {
      await runDiscovery(userId, dailyQuota)
      console.log(`[queue] ✓ Discovery complete for ${userId}`)
    } catch (e) {
      console.error(`[queue] ✗ Discovery failed for ${userId}: ${e.message}`)
      throw e
    }
  })

  console.log('[queue] Workers started: send-email, run-discovery')

  // ── Daily discovery cron ──────────────────────────────────────────────────
  // Check every minute — if a user has a schedule configured and it's time, fire a job
  setInterval(async () => {
    try {
      const now     = new Date()
      const hh      = now.getUTCHours().toString().padStart(2, '0')
      const mm      = now.getUTCMinutes().toString().padStart(2, '0')
      const nowTime = `${hh}:${mm}`

      const schedules = await prisma.scheduledDiscovery.findMany({
        where: { enabled: true, runTime: nowTime },
      })

      for (const s of schedules) {
        // Only fire if we haven't run today
        const today     = new Date().toISOString().slice(0, 10)
        const lastRunDay = s.lastRunAt?.toISOString().slice(0, 10)
        if (lastRunDay === today) continue

        console.log(`[cron] Scheduling discovery for ${s.userId} at ${nowTime} UTC`)
        await scheduleDiscoveryJob(s.userId, s.dailyQuota)
        await prisma.scheduledDiscovery.update({
          where: { id: s.id },
          data:  { lastRunAt: new Date() },
        })
      }
    } catch (e) {
      console.error('[cron] Discovery cron check failed:', e.message)
    }
  }, 60_000) // check every minute
}

// ── Rehydrate pending emails on startup ───────────────────────────────────────

/**
 * On startup, find any emails in the DB that are not yet sent/failed
 * and schedule them into pg-boss. pg-boss deduplicates via singletonKey,
 * so this is safe to call even if jobs already exist.
 */
export async function rehydrateQueue() {
  try {
    const pending = await prisma.email.findMany({
      where: { sentAt: null, failedAt: null },
    })

    if (!pending.length) return
    console.log(`[queue] Rehydrating ${pending.length} pending email(s)…`)

    for (const email of pending) {
      await scheduleEmailJob({
        id:       email.id,
        to:       email.to,
        subject:  email.subject,
        body:     email.body,
        sendAt:   (email.scheduledAt || email.createdAt).toISOString(),
        provider: email.provider || 'gmail',
        userId:   email.userId   || 'friend',
      })
    }

    console.log(`[queue] Rehydrated ${pending.length} email(s) into pg-boss`)
  } catch (e) {
    console.error('[queue] Rehydration failed:', e.message)
  }
}
