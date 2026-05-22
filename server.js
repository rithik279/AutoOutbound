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
 *   server/lib/scheduler.js  — in-process setTimeout email scheduler
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

import { migratePasswordsIfNeeded } from './server/lib/users.js'
import { rehydrateQueue }           from './server/lib/scheduler.js'
import { logTokenHealth }           from './server/lib/tokens.js'
import { PORT }                     from './server/lib/config.js'

import aiRouter        from './server/routes/ai.js'
import apolloRouter    from './server/routes/apollo.js'
import authRouter      from './server/routes/auth.js'
import emailRouter     from './server/routes/email.js'
import contactsRouter  from './server/routes/contacts.js'
import userRouter      from './server/routes/user.js'
import discoveryRouter from './server/routes/discovery.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app       = express()

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))

// CORS — allow the Vite dev server and production frontend to call the API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin',  '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-apollo-key, x-user-id')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api', aiRouter)
app.use('/api', apolloRouter)
app.use('/api', authRouter)
app.use('/api', emailRouter)
app.use('/api', contactsRouter)
app.use('/api', userRouter)
app.use('/api', discoveryRouter)

// Simple liveness probe used by Render and monitoring tools
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// ── Serve built frontend in production ─────────────────────────────────────────
// In development, Vite serves the frontend on its own port (3000/5173).
// In production, Express serves the pre-built /dist folder.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')))
  // SPA catch-all — React Router handles client-side routing
  app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))
}

// ── Startup tasks ──────────────────────────────────────────────────────────────
// Migrate plaintext passwords to bcrypt hashes (safe to run on every boot)
await migratePasswordsIfNeeded()

// Re-schedule any emails that were pending when the server last shut down
await rehydrateQueue()

// Log Outlook token health every 10 minutes so expiry is visible in logs
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
