/**
 * server/lib/email-sender.js
 *
 * High-level email sending functions used by the scheduler.
 * Routes each email to the correct provider (Outlook Graph API or Gmail API).
 *
 * sendViaGraph — Microsoft Graph API
 *   - Sends from the OUTLOOK_USER address stored in .tokens.json
 *   - Attaches the resume .docx file if it exists on disk
 *   - Saves a copy to the sender's Sent Items
 *
 * sendViaGmail — Gmail REST API
 *   - Sends from the user's connected Gmail account
 *   - No resume attachment (would require MIME multipart encoding)
 *   - See server/lib/gmail.js for implementation details
 *
 * Both functions throw on failure; the scheduler catches and marks the email
 * as failed in the database.
 */

import { readFileSync, existsSync } from 'fs'
import fetch from 'node-fetch'
import { getGraphToken } from './tokens.js'
import { sendViaGmail as _sendViaGmail } from './gmail.js'
import { RESUME_PATH } from './config.js'
import { buildTrackedHtml } from './email-tracking.js'

// ── Outlook / Microsoft Graph ─────────────────────────────────────────────────

/**
 * Send a plain-text email via the Microsoft Graph API.
 * Attaches the sender's resume if the file exists at RESUME_PATH.
 *
 * @param {{ to: string, subject: string, body: string }} opts
 * @throws {Error} if Graph API returns a non-2xx status
 */
export async function sendViaGraph({ to, subject, body, trackingId }, userId) {
  const token = await getGraphToken(userId)

  // Attach resume if present on disk
  const attachments = []
  if (existsSync(RESUME_PATH)) {
    attachments.push({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name:          'Manmit_Singh_Resume.docx',
      contentType:   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contentBytes:  readFileSync(RESUME_PATH).toString('base64'),
    })
  }

  // Use tracked HTML body if trackingId is available
  const htmlBody = trackingId ? buildTrackedHtml(body, trackingId) : null

  const messageBody = {
    subject,
    body: htmlBody
      ? { contentType: 'HTML', content: htmlBody }
      : { contentType: 'Text', content: body },
    toRecipients: [{ emailAddress: { address: to } }],
    attachments,
  }

  // Step 1: Create draft — this gives us an ID and conversationId for reply tracking
  const draftRes = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(messageBody),
  })

  if (!draftRes.ok) {
    const err = await draftRes.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Graph create draft error ${draftRes.status}`)
  }

  const draft = await draftRes.json()
  const messageId      = draft.id             || null
  const conversationId = draft.conversationId || null

  // Step 2: Send the draft
  const sendRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/send`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!sendRes.ok) {
    const err = await sendRes.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Graph send error ${sendRes.status}`)
  }

  // Return IDs so the queue worker can store them for reply detection
  return { outlookMessageId: messageId, outlookConversationId: conversationId }
}

// ── Gmail ─────────────────────────────────────────────────────────────────────

/**
 * Send a plain-text email via the Gmail REST API.
 * Delegates to gmail.js where the implementation lives.
 *
 * @param {{ to: string, subject: string, body: string }} opts
 * @param {string} userId
 */
export async function sendViaGmail(opts, userId) {
  return _sendViaGmail(opts, userId)
}

