/**
 * server/routes/tracking.js
 *
 * Email open and click tracking endpoints.
 * These routes are PUBLIC — no auth required (emails are opened by recipients).
 *
 * Routes:
 *   GET /api/track/open/:trackingId   — Record an email open, return 1×1 transparent GIF
 *   GET /api/track/click/:trackingId/:linkId — Record a click, redirect to original URL
 *
 * How tracking works:
 *   - On send, each email body is transformed to HTML
 *   - A 1×1 tracking pixel is appended: <img src="/api/track/open/:trackingId">
 *   - All http/https links are rewritten to: /api/track/click/:trackingId/:linkId
 *   - linkId maps to the original URL stored in EmailEvent metadata
 */

import { Router } from 'express'
import { prisma }  from '../lib/prisma.js'

const router = Router()

// 1×1 transparent GIF — returned for every open ping
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

// ── Open tracking ─────────────────────────────────────────────────────────────

/**
 * GET /api/track/open/:trackingId
 *
 * Called when the recipient's email client loads the tracking pixel.
 * Increments openCount, records firstOpenedAt on first open, logs an EmailEvent.
 * Returns a 1×1 transparent GIF so the email renders normally.
 */
router.get('/track/open/:trackingId', async (req, res) => {
  // Always return the pixel immediately — never block the recipient
  res.set({
    'Content-Type':  'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma':        'no-cache',
    'Expires':       '0',
  })
  res.end(TRANSPARENT_GIF)

  // Log asynchronously so it never slows down the pixel response
  try {
    const { trackingId } = req.params
    const email = await prisma.email.findUnique({ where: { trackingId } })
    if (!email) return

    const ip        = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
    const userAgent = req.headers['user-agent'] || ''

    await prisma.$transaction([
      // Increment open count; set firstOpenedAt only on first open
      prisma.email.update({
        where: { trackingId },
        data:  {
          openCount:    { increment: 1 },
          firstOpenedAt: email.firstOpenedAt ?? new Date(),
        },
      }),
      // Log the event
      prisma.emailEvent.create({
        data: {
          emailId:   email.id,
          type:      'open',
          ip,
          userAgent,
        },
      }),
    ])

    console.log(`[track] Open: email ${email.id} (${email.to})`)
  } catch (e) {
    console.error('[track] Open log failed:', e.message)
  }
})

// ── Click tracking ─────────────────────────────────────────────────────────────

/**
 * GET /api/track/click/:trackingId/:linkId
 *
 * Called when the recipient clicks a tracked link.
 * linkId is a base64url-encoded version of the original URL.
 * Increments clickCount, logs an EmailEvent, then redirects to the original URL.
 */
router.get('/track/click/:trackingId/:linkId', async (req, res) => {
  const { trackingId, linkId } = req.params

  // Decode the original URL first so we can redirect even if DB logging fails
  let originalUrl = '/'
  try {
    originalUrl = Buffer.from(linkId, 'base64url').toString('utf-8')
    // Basic sanity check — must be http/https
    const parsed = new URL(originalUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      originalUrl = '/'
    }
  } catch {
    originalUrl = '/'
  }

  // Redirect immediately — never block the user's click
  res.redirect(302, originalUrl)

  // Log asynchronously
  try {
    const email = await prisma.email.findUnique({ where: { trackingId } })
    if (!email) return

    const ip        = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
    const userAgent = req.headers['user-agent'] || ''

    await prisma.$transaction([
      prisma.email.update({
        where: { trackingId },
        data:  { clickCount: { increment: 1 } },
      }),
      prisma.emailEvent.create({
        data: {
          emailId:   email.id,
          type:      'click',
          linkUrl:   originalUrl,
          ip,
          userAgent,
        },
      }),
    ])

    console.log(`[track] Click: email ${email.id} → ${originalUrl}`)
  } catch (e) {
    console.error('[track] Click log failed:', e.message)
  }
})

// ── Tracking stats API ─────────────────────────────────────────────────────────

/**
 * GET /api/track/stats
 *
 * Returns aggregate open/click stats for the current user's sent emails.
 * Used by the frontend dashboard.
 *
 * Response: { totalSent, totalOpened, totalClicked, openRate, clickRate }
 */
router.get('/track/stats', async (req, res) => {
  const userId = req.userId || req.headers['x-user-id'] || 'friend'
  try {
    const [totalSent, totalOpened, totalClicked] = await Promise.all([
      prisma.email.count({ where: { userId, sentAt: { not: null } } }),
      prisma.email.count({ where: { userId, sentAt: { not: null }, openCount: { gt: 0 } } }),
      prisma.email.count({ where: { userId, sentAt: { not: null }, clickCount: { gt: 0 } } }),
    ])

    res.json({
      totalSent,
      totalOpened,
      totalClicked,
      openRate:  totalSent > 0 ? Math.round((totalOpened  / totalSent) * 100) : 0,
      clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
    })
  } catch (e) {
    console.error('[track] stats error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

export default router
