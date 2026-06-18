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
import { httpFetch } from './http.js'
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

  // Preferred path: create a draft then send it — this captures the messageId
  // and conversationId used for reply tracking. Requires the Mail.ReadWrite
  // scope. If the token only has Mail.Send (older consent), the draft create
  // returns "Access is denied"; fall back to a direct /me/sendMail, which
  // needs only Mail.Send but yields no conversationId.
  // Sends are NOT retried (retries:0) — a retried send risks a duplicate email.
  // Timeouts still apply so a hung Graph call can't wedge the worker; pg-boss
  // retries the whole job on failure.
  const draftRes = await httpFetch('https://graph.microsoft.com/v1.0/me/messages', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(messageBody),
  }, { timeoutMs: 20_000, retries: 0, label: 'graph-create-draft' })

  if (draftRes.ok) {
    const draft = await draftRes.json()
    const messageId      = draft.id             || null
    const conversationId = draft.conversationId || null

    const sendRes = await httpFetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/send`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    }, { timeoutMs: 20_000, retries: 0, label: 'graph-send-draft' })
    if (!sendRes.ok) {
      const err = await sendRes.json().catch(() => ({}))
      throw new Error(err?.error?.message || `Graph send error ${sendRes.status}`)
    }
    return { outlookMessageId: messageId, outlookConversationId: conversationId }
  }

  // Fallback: direct send (no draft) — only needs Mail.Send. Not retried.
  const sendMailRes = await httpFetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message: messageBody, saveToSentItems: true }),
  }, { timeoutMs: 20_000, retries: 0, label: 'graph-sendmail' })
  if (!sendMailRes.ok) {
    const err = await sendMailRes.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Graph sendMail error ${sendMailRes.status}`)
  }

  // No conversationId available via sendMail — reply tracking unavailable for this send.
  return { outlookMessageId: null, outlookConversationId: null }
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

