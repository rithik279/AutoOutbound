/**
 * server.js — Campaign Pipeline API server
 *
 * Thin entry point. All business logic lives in server/routes/ and server/lib/.
 *
 * Architecture:
 *   server/lib/config.js     — all environment variables
 *   server/lib/prisma.js     — shared Prisma client (PostgreSQL)
 *   server/lib/users.js      — user auth (bcrypt passwords, JSON file store)
 *   server/lib/tokens.js     — Outlook OAuth token management
 *   server/lib/gmail.js      — Gmail OAuth token management + sending
 *   server/lib/email-sender.js — sendViaGraph / sendViaGmail
 *   server/lib/queue.js       — pg-boss job queue (email sending + discovery)
 *   server/lib/oauth-state.js — ephemeral PKCE verifier store
 *
 *   server/routes/ai.js        — POST /api/ai/chat (OpenAI + Anthropic proxy)
 *   server/routes/apollo.js    — Apollo proxy, company validation, site fetch
 *   server/routes/auth.js      — OAuth flows (Outlook + Gmail)
 *   server/routes/email.js     — Email scheduling, status, retry
 *   server/routes/contacts.js  — Contact CRUD
 *   server/routes/user.js      — Login, signup, profile, prompt templates
 *   server/routes/discovery.js — Automated prospect discovery
 *
 * Startup sequence:
 *   1. Load .env
 *   2. Migrate any plaintext passwords → bcrypt hashes
 *   3. Rehydrate pending emails from the database into the scheduler
 *   4. Start background Outlook token health check (every 10 min)
 *   5. Start HTTP server
 *
 * Deployment:
 *   - Backend: Render (Node.js server, render.yaml)
 *   - Frontend: Vercel (static build from /dist, vercel.json)
 *   - Push to main → auto-deploy via CI/CD
 */

import 'dotenv/config'
import express  from 'express'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname }       from 'path'

import { migratePasswordsIfNeeded }        from './server/lib/users.js'
import { rehydrateQueue, startWorkers }    from './server/lib/queue.js'
import { logTokenHealth }                  from './server/lib/tokens.js'
import { checkRepliesAllUsers }            from './server/lib/replies.js'
import { PORT }                            from './server/lib/config.js'
import { requireAuth }                     from './server/lib/middleware.js'

import aiRouter        from './server/routes/ai.js'
import apolloRouter    from './server/routes/apollo.js'
import authRouter      from './server/routes/auth.js'
import emailRouter     from './server/routes/email.js'
import contactsRouter  from './server/routes/contacts.js'
import userRouter      from './server/routes/user.js'
import discoveryRouter from './server/routes/discovery.js'
import trackingRouter  from './server/routes/tracking.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app       = express()

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' })) // Reduced from 10mb — no legitimate use case needs more

// CORS — lock to known origins in production; allow all in dev
const ALLOWED_ORIGINS = new Set([
  'https://auto-outbound.rithiksingh.com',
  'https://firstshot.rithiksingh.com',
  'http://localhost:3000',
  'http://localhost:5173',
])
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
  } else if (!origin) {
    // Server-to-server or same-origin — allow
    res.header('Access-Control-Allow-Origin', '*')
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-apollo-key, x-user-id, Authorization')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// Global 30s request timeout — prevents hanging on slow upstreams
app.use((req, res, next) => {
  res.setTimeout(30_000, () => {
    res.status(503).json({ error: 'Request timed out' })
  })
  next()
})

// ── Routes ─────────────────────────────────────────────────────────────────────
// Public: login, signup, OAuth callbacks, health
app.use('/api', userRouter)    // login + signup are unauthenticated; profile routes check auth internally
app.use('/api', authRouter)    // OAuth callbacks don't carry x-user-id

// Public tracking: open pixel + click redirect — no auth (called by email clients/recipients)
// Stats endpoint inside tracking router still checks userId from header
app.use('/api', trackingRouter)

// Simple liveness probe used by Render and monitoring tools — must stay
// above the requireAuth routers below, or it gets shadowed and returns 401.
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// Protected: everything else requires a valid x-user-id
app.use('/api', requireAuth, aiRouter)
app.use('/api', requireAuth, apolloRouter)
app.use('/api', requireAuth, emailRouter)
app.use('/api', requireAuth, contactsRouter)
app.use('/api', requireAuth, discoveryRouter)

// ── Serve built frontend in production ─────────────────────────────────────────
// In development, Vite serves the frontend on its own port (3000/5173).
// In production, Express serves the pre-built /dist folder.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')))
  // SPA catch-all — React Router handles client-side routing
  app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))
}

// ── Global error handler ───────────────────────────────────────────────────────
// Registered last. Catches anything thrown in a sync handler or passed to
// next(err), so one bad request returns 500 JSON instead of hanging the socket
// or bubbling into an uncaughtException that restarts the instance.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] Unhandled route error:', err?.message || err)
  if (res.headersSent) return next(err)
  res.status(500).json({ error: 'Internal server error' })
})

// ── Start server FIRST ───────────────────────────────────────────────────────
// Listen immediately so /api/health responds and Render can promote this
// instance. DB/queue init is deferred to the background below — if we blocked
// on it and pg-boss couldn't connect (e.g. the old instance still holds
// Supabase pooler connections during a deploy), the server would never listen,
// health would never pass, the old instance would never be retired, and its
// connections would never free — a boot deadlock.
app.listen(PORT, () => {
  console.log(`✓ API server running on http://localhost:${PORT}`)
})

// ── Background startup tasks (retry, never crash the process) ──────────────────
async function initBackgroundTasks(attempt = 1) {
  try {
    await migratePasswordsIfNeeded()   // one-time users.json → Postgres migration
    await startWorkers()               // pg-boss workers + daily discovery cron
    await rehydrateQueue()             // re-schedule emails pending before last shutdown
    console.log('[server] Background tasks initialized')
  } catch (e) {
    const delay = Math.min(60_000, 5_000 * attempt)
    console.error(`[server] Background init failed (attempt ${attempt}): ${e.message} — retrying in ${Math.round(delay / 1000)}s`)
    setTimeout(() => initBackgroundTasks(attempt + 1), delay)
  }
}
initBackgroundTasks()

// Log Outlook token health every 10 minutes
setInterval(logTokenHealth, 10 * 60_000)

// ── Near-real-time reply polling ──────────────────────────────────────────────
// Sweep all users with outstanding sent emails every 60s so "Replied" status
// updates without the user opening the Sent Emails page. Guarded against
// overlapping runs and never throws (the route remains available for on-demand).
let replySweepRunning = false
setInterval(async () => {
  if (replySweepRunning) return
  replySweepRunning = true
  try { await checkRepliesAllUsers() }
  catch (e) { console.error('[replies] background sweep error:', e.message) }
  finally { replySweepRunning = false }
}, 60_000)

// ── Global error handlers ──────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason instanceof Error ? reason.message : reason)
})
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err.message)
  process.exit(1)
})
