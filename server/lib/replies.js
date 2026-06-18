/**
 * server/lib/replies.js
 *
 * Reply detection for sent emails, shared by the on-demand POST /api/check-replies
 * route and the background poller (server.js). Kept in lib/ so both the route
 * layer and the startup poller can import it without a circular dependency.
 *
 *   Gmail   — fetch the thread; a reply exists if there's a message from the
 *             recipient (and not the sender).
 *   Outlook — query the conversation; same rule.
 *
 * On detection: Email.repliedAt is set and the Contact flips to state 'replied'.
 * Idempotent — only scans emails with repliedAt = null, so re-runs are safe.
 */

import { prisma, resolveUserId } from './prisma.js'
import { getGmailToken } from './gmail.js'
import { getGraphToken } from './tokens.js'
import { httpFetch } from './http.js'

const BATCH = 10

async function markReplied(emailId, contactId, provider, to) {
  await prisma.$transaction([
    prisma.email.update({ where: { id: emailId }, data: { repliedAt: new Date() } }),
    prisma.contact.update({ where: { id: contactId }, data: { state: 'replied' } }),
  ])
  console.log(`[replies] ${provider} reply: email ${emailId} from ${to}`)
}

/**
 * Scan one user's unreplied sent emails for replies.
 * @param {string} userId  — internal id or Clerk id
 * @returns {Promise<number>} number of new replies detected
 */
export async function checkRepliesForUser(userId) {
  const id = await resolveUserId(userId)
  if (!id) return 0

  const user = await prisma.user.findUnique({ where: { id }, select: { senderEmail: true } })
  const senderEmail = user?.senderEmail?.toLowerCase() || ''

  let repliesFound = 0

  // ── Gmail ──────────────────────────────────────────────────────────────────
  const gmailEmails = await prisma.email.findMany({
    where:  { userId: id, provider: 'gmail', sentAt: { not: null }, gmailThreadId: { not: null }, repliedAt: null },
    select: { id: true, to: true, gmailThreadId: true, contactId: true },
  })

  if (gmailEmails.length > 0) {
    let gmailToken = null
    try { gmailToken = await getGmailToken(id) } catch {}
    if (gmailToken) {
      for (let i = 0; i < gmailEmails.length; i += BATCH) {
        await Promise.all(gmailEmails.slice(i, i + BATCH).map(async (email) => {
          try {
            const threadRes = await httpFetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/threads/${email.gmailThreadId}?format=metadata&metadataHeaders=From`,
              { headers: { Authorization: `Bearer ${gmailToken}` } },
              { timeoutMs: 12_000, retries: 2, label: 'gmail-thread' }
            )
            if (!threadRes.ok) return
            const thread   = await threadRes.json()
            const messages = thread.messages || []
            const hasReply = messages.length > 1 && messages.some(msg => {
              const from = (msg.payload?.headers?.find(h => h.name === 'From')?.value || '').toLowerCase()
              return from.includes(email.to.toLowerCase()) && !from.includes(senderEmail)
            })
            if (hasReply) { repliesFound++; await markReplied(email.id, email.contactId, 'Gmail', email.to) }
          } catch (e) { console.error(`[replies] Gmail thread error email ${email.id}:`, e.message) }
        }))
      }
    }
  }

  // ── Outlook ──────────────────────────────────────────────────────────────────
  const outlookEmails = await prisma.email.findMany({
    where:  { userId: id, provider: 'outlook', sentAt: { not: null }, outlookConversationId: { not: null }, repliedAt: null },
    select: { id: true, to: true, outlookConversationId: true, contactId: true },
  })

  if (outlookEmails.length > 0) {
    let graphToken = null
    try { graphToken = await getGraphToken(id) } catch {}
    if (graphToken) {
      for (let i = 0; i < outlookEmails.length; i += BATCH) {
        await Promise.all(outlookEmails.slice(i, i + BATCH).map(async (email) => {
          try {
            const convRes = await httpFetch(
              `https://graph.microsoft.com/v1.0/me/messages?$filter=conversationId eq '${email.outlookConversationId}'&$select=from,sender&$top=25`,
              { headers: { Authorization: `Bearer ${graphToken}` } },
              { timeoutMs: 12_000, retries: 2, label: 'graph-conversation' }
            )
            if (!convRes.ok) return
            const conv     = await convRes.json()
            const messages = conv.value || []
            const hasReply = messages.length > 1 && messages.some(msg => {
              const fromAddr = (msg.from?.emailAddress?.address || msg.sender?.emailAddress?.address || '').toLowerCase()
              return fromAddr.includes(email.to.toLowerCase()) && !fromAddr.includes(senderEmail)
            })
            if (hasReply) { repliesFound++; await markReplied(email.id, email.contactId, 'Outlook', email.to) }
          } catch (e) { console.error(`[replies] Outlook conv error email ${email.id}:`, e.message) }
        }))
      }
    }
  }

  return repliesFound
}

/**
 * Background sweep: find every user with an unreplied sent email and check each.
 * Bounded work — only users with outstanding emails are scanned.
 * @returns {Promise<number>} total new replies across all users
 */
export async function checkRepliesAllUsers() {
  const rows = await prisma.email.findMany({
    where:    { sentAt: { not: null }, repliedAt: null, OR: [{ gmailThreadId: { not: null } }, { outlookConversationId: { not: null } }] },
    select:   { userId: true },
    distinct: ['userId'],
  })
  let total = 0
  for (const { userId } of rows) {
    try { total += await checkRepliesForUser(userId) }
    catch (e) { console.error(`[replies] sweep failed for ${userId}:`, e.message) }
  }
  if (total > 0) console.log(`[replies] background sweep: ${total} new replies across ${rows.length} user(s)`)
  return total
}
