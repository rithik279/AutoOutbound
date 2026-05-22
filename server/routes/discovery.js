/**
 * server/routes/discovery.js
 *
 * Automated prospect discovery — finds decision-makers at imported companies
 * and adds them as contacts for later email drafting.
 *
 * How discovery works:
 *   1. User uploads a CSV of companies via /api/companies/validate-batch
 *      (apollo.js route), which saves them to ImportedCompany in the DB.
 *   2. User configures a daily schedule via /api/discovery/config.
 *   3. /api/discovery/run (triggered manually or by a cron) processes
 *      ImportedCompany records, searches Apollo for decision-makers at each,
 *      and creates Contact records for newly found people.
 *   4. /api/discovery/status shows current configuration and progress.
 *
 * Target personas (hardcoded for Manmit's use case):
 *   Directors, VPs, CTOs, and Heads of Data Engineering — the most likely
 *   buyers for senior data engineering contract services.
 *
 * Routes:
 *   POST /api/discovery/run      — Trigger discovery manually
 *   GET  /api/discovery/status   — Configuration + stats
 *   POST /api/discovery/config   — Save schedule configuration
 */

import { Router } from 'express'
import fetch      from 'node-fetch'
import { prisma } from '../lib/prisma.js'
import { APOLLO_KEY } from '../lib/config.js'

const router = Router()

// ── Core discovery logic ──────────────────────────────────────────────────────

/**
 * Run one discovery pass for a user.
 *
 * For each pending ImportedCompany (up to `limit`), searches Apollo for
 * relevant decision-makers and creates Contact records for new people.
 * Already-contacted emails (by source='discovery') are skipped to prevent
 * duplicate outreach.
 *
 * @param {string} userId
 * @param {number} [limit=50]  max companies to process per run
 * @returns {Promise<{ found: number, skipped: number, contacted: number }>}
 */
export async function runDiscovery(userId, limit = 50) {
  // Load discovery configuration — throws if not configured yet
  const config = await prisma.scheduledDiscovery.findUnique({ where: { userId } })
  if (!config) throw new Error('Discovery not configured — set up a schedule first')

  const companies = await prisma.importedCompany.findMany({
    where: { userId, status: { in: ['pending', 'discovered'] } },
    take:  limit,
  })

  if (companies.length === 0) {
    return { found: 0, contacted: 0, skipped: 0 }
  }

  // Build a set of already-emailed addresses to deduplicate
  const contacted      = await prisma.contact.findMany({ where: { source: 'discovery' }, select: { email: true } })
  const contactedEmails = new Set(contacted.map(c => c.email))

  let found   = 0
  let skipped = 0

  for (const co of companies) {
    if (!co.apolloOrgId) continue // Can't search Apollo without an org ID

    // Search for senior data/engineering roles at this company
    const apolloRes = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-api-key':     APOLLO_KEY,
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        q_organization_ids:  [co.apolloOrgId],
        person_titles: [
          'Director of Data Engineering', 'Head of Data', 'VP Data Engineering',
          'Director of Data Platform', 'Data Platform Manager', 'CTO', 'VP Engineering',
        ],
        person_seniorities: ['director', 'manager', 'vp', 'c_suite'],
        per_page: 10,
      }),
    })

    if (apolloRes.ok) {
      const data   = await apolloRes.json()
      const people = data.people || []

      for (const person of people) {
        if (!person.email || contactedEmails.has(person.email)) {
          skipped++
          continue
        }

        await prisma.contact.create({
          data: {
            email:    person.email,
            name:     `${person.first_name || ''} ${person.last_name || ''}`.trim(),
            title:    person.title       || '',
            company:  co.name,
            domain:   co.domain,
            linkedin: person.linkedin_url || '',
            source:   'discovery',
          },
        })
        found++
        contactedEmails.add(person.email)
      }
    }

    // Mark company as processed so it won't be re-processed next run
    await prisma.importedCompany.update({
      where: { id: co.id },
      data:  { status: 'discovered' },
    })
  }

  // Update the last-run timestamp
  await prisma.scheduledDiscovery.update({
    where: { userId },
    data:  { lastRunAt: new Date() },
  })

  console.log(`[discovery] user=${userId} found=${found} skipped=${skipped}`)
  return { found, skipped, contacted: contactedEmails.size }
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/discovery/run
 *
 * Triggers one discovery pass manually. Also called by a cron job or
 * external scheduler for automated daily runs.
 *
 * Headers: x-user-id
 */
router.post('/discovery/run', async (req, res) => {
  const userId = req.headers['x-user-id'] || req.body.userId
  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  try {
    const result = await runDiscovery(userId, 50)
    res.json({ success: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/**
 * GET /api/discovery/status
 *
 * Returns the current discovery configuration and progress stats.
 *
 * Response: { configured, runTime, dailyQuota, enabled, lastRunAt,
 *             pendingCompanies, discoveredContacts }
 */
router.get('/discovery/status', async (req, res) => {
  const userId = req.headers['x-user-id']
  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  try {
    const [config, companies, contacts] = await Promise.all([
      prisma.scheduledDiscovery.findUnique({ where: { userId } }),
      prisma.importedCompany.count({ where: { userId, status: { in: ['pending', 'discovered'] } } }),
      prisma.contact.count({ where: { source: 'discovery' } }),
    ])

    res.json({
      configured:         !!config,
      runTime:            config?.runTime,
      dailyQuota:         config?.dailyQuota,
      enabled:            config?.enabled,
      lastRunAt:          config?.lastRunAt,
      pendingCompanies:   companies,
      discoveredContacts: contacts,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/**
 * POST /api/discovery/config
 *
 * Save or update the user's discovery schedule configuration.
 * Uses upsert so it creates on first call, updates on subsequent calls.
 *
 * Body: { runTime: 'HH:MM', dailyQuota: number, enabled: boolean }
 */
router.post('/discovery/config', async (req, res) => {
  const userId = req.headers['x-user-id']
  const { runTime, dailyQuota, enabled } = req.body
  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  try {
    const config = await prisma.scheduledDiscovery.upsert({
      where:  { userId },
      update: { runTime, dailyQuota, enabled },
      create: { userId, runTime, dailyQuota, enabled },
    })
    res.json({ success: true, config })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
