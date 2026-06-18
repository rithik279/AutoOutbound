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

// ── Startup tasks ──────────────────────────────────────────────────────────────
// Migrate users from users.json → Postgres (one-time, no-op if already done)
await migratePasswordsIfNeeded()

// Start pg-boss job queue workers (send-email + run-discovery)
// and wire the daily discovery cron
await startWorkers()

// Rehydrate any emails that were pending before last shutdown into pg-boss
await rehydrateQueue()

// Log Outlook token health every 10 minutes
setInterval(logTokenHealth, 10 * 60_000)

// ── Start server ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ API server running on http://localhost:${PORT}`)
})

// ── Global error handlers ──────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason instanceof Error ? reason.message : reason)
})
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err.message)
  process.exit(1)
})
