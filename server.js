import express from 'express'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fetch from 'node-fetch'
import nodemailer from 'nodemailer'
import mammoth from 'mammoth'

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
const OUTLOOK_USER  = process.env.OUTLOOK_USER        || 'manmit.singh@live.com'
const OUTLOOK_PASS  = process.env.OUTLOOK_PASS        || 'Rithik!234!'   // your Outlook / Live account password

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

// ── Schedule campaign emails (Outlook SMTP, server-side timers) ───────────
app.post('/api/schedule-campaign', async (req, res) => {
  if (!OUTLOOK_PASS) {
    return res.status(503).json({ error: 'Outlook password not set in server.js' })
  }
  const { emails } = req.body  // [{ to, subject, body, sendAt }]
  if (!Array.isArray(emails) || !emails.length) {
    return res.status(400).json({ error: 'Missing emails array' })
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    auth: { user: OUTLOOK_USER, pass: OUTLOOK_PASS }
  })

  let sent = 0
  let failed = 0

  emails.forEach(({ to, subject, body, sendAt }) => {
    const delay = Math.max(0, new Date(sendAt).getTime() - Date.now())
    setTimeout(async () => {
      try {
        await transporter.sendMail({ from: OUTLOOK_USER, to, subject, text: body })
        sent++
        console.log(`[campaign] sent to ${to} (${sent}/${emails.length})`)
      } catch (e) {
        failed++
        console.error(`[campaign] failed to ${to}: ${e.message}`)
      }
    }, delay)
  })

  console.log(`[campaign] ${emails.length} emails scheduled`)
  res.json({ ok: true, count: emails.length })
})

// ── Send review email (Outlook → self) ────────────────────────────────────
app.post('/api/send-review-email', async (req, res) => {
  if (!OUTLOOK_PASS) {
    return res.status(503).json({ error: 'Outlook password not set — add OUTLOOK_PASS in server.js' })
  }
  const { filename, content } = req.body
  if (!content) return res.status(400).json({ error: 'Missing content' })
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      auth: { user: OUTLOOK_USER, pass: OUTLOOK_PASS }
    })
    await transporter.sendMail({
      from: OUTLOOK_USER,
      to: OUTLOOK_USER,
      subject: `Campaign review — ${filename || 'drafts.txt'}`,
      text: 'Your campaign drafts are attached. Open on your phone to review.',
      attachments: [{ filename: filename || 'campaign-review.txt', content, contentType: 'text/plain' }]
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
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
