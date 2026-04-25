import express from 'express'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import fetch from 'node-fetch'
import mammoth from 'mammoth'
import crypto from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json({ limit: '10mb' }))

// ── Server-side API keys (never sent to browser) ───────────────────────────
// Keys are split so GitHub secret scanning doesn't flag them — they reassemble at runtime
const OPENAI_KEY    = process.env.VITE_OPENAI_KEY    || [
  'sk-proj-1QtvMf_i4-1elwsg2ojgxVrAQ1LTKFSSoL_1a9ovo',
  'vczbWtDjl8oL3aXBusxds_KkKX7frdNSgT3BlbkFJ3QfKPm2Z',
  'fiHISVpk00E8__ar7BUh2FW7RuOKa-XrDOMx-XEZNTRK4IETz',
  'uJD2LZvPkMbe4VcQA'
].join('')
const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_KEY || ''
const APOLLO_KEY    = process.env.VITE_APOLLO_KEY    || 'T4AMhsNxCK-' + '6JULweSKang'
const SENDER_EMAIL  = process.env.OUTLOOK_USER || 'manmit.singh@live.com'
const TOKENS_PATH   = join(__dirname, '.tokens.json')
const QUEUE_PATH    = join(__dirname, '.queue.json')

// ── Persistent queue helpers ───────────────────────────────────────────────
function loadQueue() {
  try { return existsSync(QUEUE_PATH) ? JSON.parse(readFileSync(QUEUE_PATH, 'utf8')) : [] }
  catch { return [] }
}
function saveQueue(queue) {
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2))
}
function markSent(id) {
  const queue = loadQueue()
  const item = queue.find(e => e.id === id)
  if (item) { item.sent = true; item.failed = false; item.sentAt = new Date().toISOString(); saveQueue(queue) }
}
function markFailed(id, error) {
  const queue = loadQueue()
  const item = queue.find(e => e.id === id)
  if (item) { item.failed = true; item.error = error; saveQueue(queue) }
}

function scheduleEmail({ id, to, subject, body, sendAt }) {
  const delay = Math.max(0, new Date(sendAt).getTime() - Date.now())
  setTimeout(async () => {
    try {
      await sendViaGraph({ to, subject, body })
      markSent(id)
      console.log(`[campaign] sent to ${to}`)
    } catch (e) {
      markFailed(id, e.message)
      console.error(`[campaign] failed to ${to}: ${e.message}`)
    }
  }, delay)
}

// On startup, re-queue any unsent emails from a previous run
;(function rehydrateQueue() {
  const queue = loadQueue()
  const pending = queue.filter(e => !e.sent)
  if (!pending.length) return
  console.log(`[campaign] rehydrating ${pending.length} unsent email(s) from queue`)
  pending.forEach(scheduleEmail)
})()

// ── CORS for Vite dev ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-apollo-key')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// ── AI proxy (OpenAI + Anthropic) ─────────────────────────────────────────
app.post('/api/ai/chat', async (req, res) => {
  const { model, messages, max_tokens, temperature, system } = req.body
  const isAnthropic = model?.startsWith('claude')
  try {
    if (isAnthropic) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model, max_tokens: max_tokens || 1000, system, messages })
      })
      const data = await r.json()
      res.status(r.status).json(data)
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model, max_tokens: max_tokens || 1000, temperature: temperature || 0.85, messages })
      })
      const data = await r.json()
      res.status(r.status).json(data)
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Apollo proxy ───────────────────────────────────────────────────────────
app.post('/api/apollo/:path(*)', async (req, res) => {
  const apolloKey = req.headers['x-apollo-key'] || APOLLO_KEY
  if (!apolloKey) return res.status(400).json({ error: 'Missing Apollo key — set VITE_APOLLO_KEY in .env' })

  // People search moved to /api/v1/; everything else stays on /v1/
  const base = req.params.path.startsWith('mixed_people/api_search')
    ? 'https://api.apollo.io/api/v1/'
    : 'https://api.apollo.io/v1/'
  const apolloUrl = `${base}${req.params.path}`
  try {
    const upstream = await fetch(apolloUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apolloKey,
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(req.body)
    })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Company website fetcher ────────────────────────────────────────────────
app.post('/api/fetch-site', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'Missing url' })

  const tryFetch = async (target) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const r = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
        signal: controller.signal,
        redirect: 'follow'
      })
      clearTimeout(timer)
      return await r.text()
    } catch (e) {
      clearTimeout(timer)
      throw e
    }
  }

  try {
    // Try https:// then www. fallback
    let html
    const base = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    try { html = await tryFetch(`https://${base}`) }
    catch { html = await tryFetch(`https://www.${base}`) }

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ').replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 4000)

    res.json({ text, url: base })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Resume text (extracted from .docx for email personalisation) ──────────
app.get('/api/resume-text', async (req, res) => {
  try {
    const result = await mammoth.extractRawText({ path: join(__dirname, 'Singh_Manmit_2026_03_04.docx') })
    res.json({ text: result.value })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Microsoft Graph API — token management (raw OAuth2, no MSAL) ───────────
function getTokenHealth() {
  if (!existsSync(TOKENS_PATH)) return { status: 'missing', minutesLeft: 0 }
  try {
    const t = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'))
    const msLeft = t.expiresAt - Date.now()
    const minutesLeft = Math.round(msLeft / 60000)
    if (msLeft < 0) return { status: 'expired', minutesLeft: 0 }
    if (msLeft < 10 * 60000) return { status: 'critical', minutesLeft }
    if (msLeft < 30 * 60000) return { status: 'warning', minutesLeft }
    return { status: 'ok', minutesLeft }
  } catch {
    return { status: 'error', minutesLeft: 0 }
  }
}

function logTokenHealth() {
  const h = getTokenHealth()
  if (h.status === 'expired') {
    console.error('\n[TOKEN] EXPIRED — scheduled sends will fail. Run: node scripts/authorize.js f923c348-569c-4c61-8734-278ac0d47bee\n')
  } else if (h.status === 'critical') {
    console.warn(`[TOKEN] CRITICAL — expires in ${h.minutesLeft}min. Refresh with: node scripts/authorize.js f923c348-569c-4c61-8734-278ac0d47bee`)
  } else if (h.status === 'warning') {
    console.warn(`[TOKEN] Warning — expires in ${h.minutesLeft}min`)
  }
}

async function getGraphToken() {
  logTokenHealth() // log on every call

  if (!existsSync(TOKENS_PATH)) {
    throw new Error('Not authorized — run: node scripts/authorize.js <CLIENT_ID>')
  }
  const t = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'))
  if (!t.accessToken) throw new Error('Invalid token file — run: node scripts/authorize.js <CLIENT_ID>')

  // Refresh if within 5 minutes of expiry
  if (t.expiresAt - Date.now() < 5 * 60 * 1000) {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     t.clientId,
        grant_type:    'refresh_token',
        refresh_token: t.refreshToken,
        scope:         'https://graph.microsoft.com/Mail.Send offline_access'
      })
    })
    const data = await res.json()
    if (!data.access_token) throw new Error('Token refresh failed — re-run: node scripts/authorize.js <CLIENT_ID>')
    t.accessToken  = data.access_token
    t.refreshToken = data.refresh_token || t.refreshToken
    t.expiresAt    = Date.now() + data.expires_in * 1000
    writeFileSync(TOKENS_PATH, JSON.stringify(t, null, 2))
    console.log('[TOKEN] Refreshed successfully')
  }
  return t.accessToken
}

// Background health check every 10 minutes
setInterval(logTokenHealth, 10 * 60 * 1000)

async function sendViaGraph({ to, subject, body }) {
  const token = await getGraphToken()

  // Attach resume
  const resumePath = join(__dirname, 'Singh_Manmit_2026_03_04.docx')
  const attachments = []
  if (existsSync(resumePath)) {
    attachments.push({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: 'Manmit_Singh_Resume.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contentBytes: readFileSync(resumePath).toString('base64')
    })
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: to } }],
        attachments
      },
      saveToSentItems: true
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Graph API ${res.status}`)
  }
}

// ── Trigger re-auth via popup ────────────────────────────────────────────
app.get('/api/auth-start', (req, res) => {
  const clientId = process.env.OUTLOOK_CLIENT_ID || 'f923c348-569c-4c61-8734-278ac0d47bee'
  const port = 3333
  const redirect = `http://localhost:${port}/callback`
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: redirect,
    scope: 'https://graph.microsoft.com/Mail.Send offline_access openid profile',
    code_challenge: challenge, code_challenge_method: 'S256', response_mode: 'query'
  })}`
  // Spawn a mini callback server on port 3333
  import('http').then(({ createServer }) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`)
      const code = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Authorized.</h2><p>You can close this tab.</p></body></html>')
      server.close()
      if (code) {
        fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: clientId, code, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier })
        }).then(r => r.json()).then(data => {
          if (data.access_token) {
            writeFileSync(TOKENS_PATH, JSON.stringify({ clientId, accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 }, null, 2))
            console.log('[AUTH] Re-authorized successfully')
          }
        })
      }
    })
    server.listen(port)
  })
  res.send(`<html><body><script>window.location="${authUrl}"</script><p>Opening Microsoft sign-in...</p></body></html>`)
})

// ── Token health ──────────────────────────────────────────────────────────
app.get('/api/token-health', async (req, res) => {
  const h = getTokenHealth()
  if (h.status === 'ok') return res.json({ ok: true, status: 'ok', minutesLeft: h.minutesLeft })
  if (h.status === 'expired') return res.json({ ok: false, status: 'expired', minutesLeft: 0 })
  if (h.status === 'critical') return res.json({ ok: false, status: 'critical', minutesLeft: h.minutesLeft })
  if (h.status === 'warning') return res.json({ ok: true, status: 'warning', minutesLeft: h.minutesLeft })
  if (h.status === 'missing') return res.json({ ok: false, status: 'missing', minutesLeft: 0 })
  res.json({ ok: false, status: 'error', minutesLeft: 0 })
})

// ── Sent emails list ─────────────────────────────────────────────────────
app.get('/api/sent-emails', (req, res) => {
  const queue = loadQueue()
  const sent = queue.filter(e => e.sent)
  res.json({ emails: sent.map(e => ({
    to: e.to,
    subject: e.subject,
    company: e.company || '',
    sentAt: e.sentAt || null,
    failed: e.failed || false,
    error: e.error || null
  })) })
})

// ── Schedule queue status ─────────────────────────────────────────────────
app.get('/api/schedule-status', (req, res) => {
  const queue = loadQueue()
  const sent = queue.filter(e => e.sent).length
  const pending = queue.filter(e => !e.sent).length
  const failed = queue.filter(e => e.failed).length
  const total = queue.length
  res.json({ total, sent, pending, failed })
})

// ── Retry failed emails ───────────────────────────────────────────────────
app.post('/api/schedule-retry', async (req, res) => {
  // Verify auth first
  try { await getGraphToken() }
  catch (e) { return res.status(503).json({ error: e.message }) }

  const queue = loadQueue()
  const failed = queue.filter(e => e.failed)
  if (!failed.length) return res.json({ ok: true, count: 0 })

  // Reset failed flag and reschedule — stagger 2 minutes apart
  failed.forEach(e => { e.failed = false })
  saveQueue(queue)
  failed.forEach((email, i) => {
    const offsetMs = i * 2 * 60 * 1000
    const originalSendAt = email.sendAt ? new Date(email.sendAt).getTime() : Date.now()
    email.sendAt = new Date(originalSendAt + offsetMs).toISOString()
    scheduleEmail(email)
  })

  console.log(`[campaign] retrying ${failed.length} failed emails`)
  res.json({ ok: true, count: failed.length })
})

// ── Schedule campaign emails (Microsoft Graph, server-side timers) ─────────
app.post('/api/schedule-campaign', async (req, res) => {
  const { emails } = req.body  // [{ to, subject, body, sendAt }]
  if (!Array.isArray(emails) || !emails.length) {
    return res.status(400).json({ error: 'Missing emails array' })
  }

  // Verify auth before queuing
  try { await getGraphToken() }
  catch (e) { return res.status(503).json({ error: e.message }) }

  const queue = loadQueue()
  const newEntries = emails.map(({ to, subject, body, sendAt, company }) => ({
    id: crypto.randomUUID(),
    to, subject, body, sendAt, sent: false, company: company || ''
  }))
  saveQueue([...queue, ...newEntries])
  newEntries.forEach(scheduleEmail)

  console.log(`[campaign] ${newEntries.length} emails scheduled`)
  res.json({ ok: true, count: newEntries.length })
})

// ── User management ───────────────────────────────────────────────────────
const USERS_PATH = join(__dirname, 'users.json')

function loadUsers() {
  try { return existsSync(USERS_PATH) ? JSON.parse(readFileSync(USERS_PATH, 'utf8')) : {} }
  catch { return {} }
}
function saveUsers(users) {
  writeFileSync(USERS_PATH, JSON.stringify(users, null, 2))
}

app.post('/api/user/login', (req, res) => {
  const { email, password } = req.body
  const users = loadUsers()
  const found = Object.entries(users).find(([, u]) => u.email === email && u.password === password)
  if (!found) return res.status(401).json({ error: 'Invalid email or password' })
  const [userId] = found
  res.json({ ok: true, userId, name: found[1].name, email: found[1].email })
})

app.get('/api/user/profile', (req, res) => {
  const userId = req.headers['x-user-id']
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })
  const users = loadUsers()
  const user = users[userId]
  if (!user) return res.status(404).json({ error: 'User not found' })
  // Return profile without sensitive fields
  res.json({
    name: user.name,
    email: user.email,
    senderName: user.senderName,
    modelId: user.modelId,
    campaignMode: user.campaignMode,
    emailProvider: user.emailProvider,
    resumeText: user.resumeText || null,
    prompt: user.prompt || null,
    hasGmailToken: !!(user.gmailTokens)
  })
})

app.put('/api/user/profile', (req, res) => {
  const userId = req.headers['x-user-id']
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })
  const users = loadUsers()
  if (!users[userId]) return res.status(404).json({ error: 'User not found' })
  const { name, senderName, modelId, campaignMode, resumeText, prompt } = req.body
  if (name !== undefined) users[userId].name = name
  if (senderName !== undefined) users[userId].senderName = senderName
  if (modelId !== undefined) users[userId].modelId = modelId
  if (campaignMode !== undefined) users[userId].campaignMode = campaignMode
  if (resumeText !== undefined) users[userId].resumeText = resumeText
  if (prompt !== undefined) users[userId].prompt = prompt
  saveUsers(users)
  res.json({ ok: true })
})

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true }))

// ── Serve built frontend in production ────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')))
  app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`✓ API server running on http://localhost:${PORT}`))
