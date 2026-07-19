/**
 * server/lib/sheets.js
 *
 * Google Sheets sync for the outreach tracker.
 * Uses the Gmail OAuth token (which now includes Sheets scope) to
 * create/update a spreadsheet with all sent emails grouped by company.
 *
 * Exports:
 *   syncOutreachToSheet(userId) → Promise<{ sheetUrl, rowCount }>
 */

import { httpFetch } from './http.js'
import { getGmailToken } from './gmail.js'
import { prisma, resolveUserId } from './prisma.js'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

// ── Create a new spreadsheet ──────────────────────────────────────────────────

async function createSheet(accessToken, title) {
  const res = await httpFetch(SHEETS_API, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{
        properties: {
          title: 'Outreach Tracker',
          gridProperties: { frozenRowCount: 1 },
        },
      }],
    }),
  }, { timeoutMs: 15_000, retries: 1, label: 'sheets-create' })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Failed to create Google Sheet: ${JSON.stringify(err)}`)
  }

  const data = await res.json()
  return data.spreadsheetId
}

// ── Write data to the spreadsheet ─────────────────────────────────────────────

async function writeSheet(accessToken, spreadsheetId, rows) {
  // Clear existing data first
  await httpFetch(
    `${SHEETS_API}/${spreadsheetId}/values/Outreach Tracker:clear`,
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
    { timeoutMs: 10_000, retries: 1, label: 'sheets-clear' }
  )

  // Write all rows (header + data)
  const res = await httpFetch(
    `${SHEETS_API}/${spreadsheetId}/values/Outreach Tracker!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: 'Outreach Tracker!A1',
        majorDimension: 'ROWS',
        values: rows,
      }),
    },
    { timeoutMs: 20_000, retries: 1, label: 'sheets-write' }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Failed to write to Google Sheet: ${JSON.stringify(err)}`)
  }
}

// ── Format header row with bold + background color ────────────────────────────

async function formatHeader(accessToken, spreadsheetId) {
  // Get the sheetId (usually 0 for first sheet)
  try {
    const res = await httpFetch(
      `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      { timeoutMs: 10_000, retries: 0, label: 'sheets-meta' }
    )
    if (!res.ok) return
    const meta = await res.json()
    const sheetId = meta.sheets?.[0]?.properties?.sheetId ?? 0

    await httpFetch(
      `${SHEETS_API}/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.15, green: 0.15, blue: 0.15 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            },
            {
              autoResizeDimensions: {
                dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 8 },
              },
            },
          ],
        }),
      },
      { timeoutMs: 10_000, retries: 0, label: 'sheets-format' }
    )
  } catch {
    // Formatting is nice-to-have, don't fail the sync
  }
}

// ── Main sync function ────────────────────────────────────────────────────────

export async function syncOutreachToSheet(userId) {
  const id = await resolveUserId(userId)
  if (!id) throw new Error('User not found')

  // Get Gmail access token (will auto-refresh if needed)
  const accessToken = await getGmailToken(userId)

  // Get user record for gsheetId
  const user = await prisma.user.findUnique({
    where: { id },
    select: { gsheetId: true, name: true, email: true },
  })

  // Fetch all sent emails with contact info
  const emails = await prisma.email.findMany({
    where: { userId: id, sentAt: { not: null } },
    include: { contact: true },
    orderBy: { sentAt: 'desc' },
  })

  // Build rows
  const header = ['Company', 'Contact Name', 'Email', 'Title', 'Status', 'Sent Date', 'Opened', 'Replied']
  const dataRows = emails.map(e => {
    const status = e.repliedAt ? 'Replied'
      : e.openCount > 0 ? 'Opened'
      : e.failedAt ? 'Failed'
      : 'Sent'

    return [
      e.contact?.company || e.company || '',
      e.contact?.name || e.to.split('@')[0],
      e.to,
      e.contact?.title || '',
      status,
      e.sentAt ? new Date(e.sentAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
      e.openCount > 0 ? `Yes (${e.openCount}x)` : 'No',
      e.repliedAt ? new Date(e.repliedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'No',
    ]
  })

  const rows = [header, ...dataRows]

  let spreadsheetId = user.gsheetId

  // Create sheet if it doesn't exist
  if (!spreadsheetId) {
    const title = `AutoOutbound Tracker — ${user.name || user.email || 'Outreach'}`
    spreadsheetId = await createSheet(accessToken, title)

    // Save the sheet ID to the user record
    await prisma.user.update({
      where: { id },
      data: { gsheetId: spreadsheetId },
    })

    // Format the header on first creation
    await writeSheet(accessToken, spreadsheetId, rows)
    await formatHeader(accessToken, spreadsheetId)
  } else {
    await writeSheet(accessToken, spreadsheetId, rows)
  }

  // Update last sync timestamp
  await prisma.user.update({
    where: { id },
    data: { gsheetSyncedAt: new Date() },
  })

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
  console.log(`[sheets] Synced ${dataRows.length} rows to ${sheetUrl} for user ${userId}`)

  return { sheetUrl, rowCount: dataRows.length }
}
