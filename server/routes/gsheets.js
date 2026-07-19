/**
 * server/routes/gsheets.js
 *
 * Google Sheets sync endpoints for the outreach tracker.
 *
 * Routes:
 *   POST /api/gsheets/sync    — Trigger a manual sync to Google Sheets
 *   GET  /api/gsheets/status  — Get sync status (connected, sheetUrl, lastSyncAt)
 */

import { Router } from 'express'
import { prisma, resolveUserId } from '../lib/prisma.js'
import { syncOutreachToSheet } from '../lib/sheets.js'

const router = Router()

/**
 * POST /api/gsheets/sync
 *
 * Triggers a sync of all sent emails to Google Sheets.
 * Creates a new sheet if one doesn't exist, or updates the existing one.
 *
 * Response: { ok: true, sheetUrl: string, rowCount: number }
 */
router.post('/gsheets/sync', async (req, res) => {
  const userId = req.userId
  try {
    const result = await syncOutreachToSheet(userId)
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[gsheets] sync error:', err.message)
    // Provide helpful error messages for common issues
    if (err.message.includes('Gmail not authorized')) {
      return res.status(403).json({
        error: 'Gmail not connected. Connect your Gmail account in Settings to enable Google Sheets sync.',
      })
    }
    if (err.message.includes('insufficient')) {
      return res.status(403).json({
        error: 'Google Sheets permission not granted. Please re-connect your Gmail account to grant Sheets access.',
      })
    }
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/gsheets/status
 *
 * Returns the current Google Sheets sync status.
 *
 * Response: { connected: boolean, sheetUrl?: string, lastSyncAt?: string }
 */
router.get('/gsheets/status', async (req, res) => {
  const userId = req.userId
  try {
    const id = await resolveUserId(userId)
    if (!id) return res.status(404).json({ error: 'User not found' })

    const user = await prisma.user.findUnique({
      where: { id },
      select: { gsheetId: true, gsheetSyncedAt: true, gmailTokens: true },
    })

    const hasGmail = !!(user?.gmailTokens)
    const sheetUrl = user?.gsheetId ? `https://docs.google.com/spreadsheets/d/${user.gsheetId}` : null

    res.json({
      connected: hasGmail && !!user?.gsheetId,
      hasGmail,
      sheetUrl,
      lastSyncAt: user?.gsheetSyncedAt || null,
    })
  } catch (err) {
    console.error('[gsheets] status error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
