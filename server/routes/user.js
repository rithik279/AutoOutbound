/**
 * server/routes/user.js
 *
 * User account management: login, signup, profile read/update, and
 * email prompt template listing.
 *
 * Auth model:
 *   Users are stored in users.json (gitignored). Passwords are bcrypt-hashed.
 *   Sessions are maintained by the client storing a userId in localStorage
 *   and passing it via the x-user-id header. This is a simple trust-based
 *   model — no JWT or session tokens — acceptable for a single-user or
 *   low-threat-model deployment. For multi-tenant production, add JWT.
 *
 * Routes:
 *   POST /api/user/login          — Authenticate and return userId
 *   POST /api/user/signup         — Create new account
 *   GET  /api/user/profile        — Get profile (excludes password)
 *   PUT  /api/user/profile        — Update profile fields
 *   GET  /api/prompts/templates   — List email drafting templates from disk
 */

import { Router }                           from 'express'
import { readFileSync }                     from 'fs'
import { join }                             from 'path'
import { loadUsers, saveUsers, hashPassword, verifyPassword } from '../lib/users.js'
import { ROOT }                             from '../lib/config.js'

const router = Router()

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * POST /api/user/login
 *
 * Verifies credentials (email + bcrypt password) and returns the userId.
 * The client stores userId in localStorage and sends it as x-user-id on
 * subsequent requests.
 *
 * Body:     { email, password }
 * Response: { ok: true, userId, name, email }
 */
router.post('/user/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' })
  }

  const users = loadUsers()
  const entry = Object.entries(users).find(([, u]) => u.email === email)

  if (!entry) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const [userId, user] = entry
  const valid = await verifyPassword(password, user.password)
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  res.json({ ok: true, userId, name: user.name, email: user.email })
})

/**
 * POST /api/user/signup
 *
 * Creates a new user account. Passwords are hashed with bcrypt before storage.
 * Returns the new userId so the client can auto-login after signup.
 *
 * Body: { email, name, password }
 */
router.post('/user/signup', async (req, res) => {
  const { email, name, password } = req.body

  if (!email?.trim() || !name?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'All fields are required' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  const users = loadUsers()

  if (Object.values(users).some(u => u.email === email)) {
    return res.status(409).json({ error: 'Email already in use' })
  }

  // userId = email prefix + timestamp (base36) for uniqueness
  const userId       = `${email.split('@')[0]}-${Date.now().toString(36)}`
  const passwordHash = await hashPassword(password)

  users[userId] = {
    name:         name.trim(),
    email:        email.trim(),
    password:     passwordHash,
    senderName:   name.trim(),
    senderEmail:  email.trim(),
    modelId:      'gpt-4o-mini',
    campaignMode: 'startup',
    emailProvider: 'gmail',
  }

  saveUsers(users)
  res.json({ ok: true, userId, name: name.trim(), email: email.trim() })
})

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * GET /api/user/profile
 *
 * Returns the user's profile, excluding the password hash.
 * Also reports whether Gmail and Outlook tokens exist (for the settings UI).
 *
 * Headers:  x-user-id
 * Response: { name, email, senderName, modelId, campaignMode, emailProvider,
 *             resumeText, prompt, hasGmailToken, hasOutlookToken }
 */
router.get('/user/profile', (req, res) => {
  const userId = req.headers['x-user-id']
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })

  const users = loadUsers()
  const user  = users[userId]
  if (!user) return res.status(404).json({ error: 'User not found' })

  res.json({
    name:          user.name,
    email:         user.email,
    senderName:    user.senderName,
    senderEmail:   user.senderEmail,
    modelId:       user.modelId,
    campaignMode:  user.campaignMode,
    emailProvider: user.emailProvider,
    resumeText:    user.resumeText    || null,
    prompt:        user.prompt        || null,
    hasGmailToken: !!user.gmailTokens,
    hasOutlookToken: !!user.outlookTokens,
  })
})

/**
 * PUT /api/user/profile
 *
 * Partial update — only updates fields that are provided in the request body.
 * Allowed fields: name, senderName, senderEmail, modelId, campaignMode,
 *                 emailProvider, resumeText, prompt.
 *
 * Headers:  x-user-id
 * Response: { ok: true }
 */
router.put('/user/profile', (req, res) => {
  const userId = req.headers['x-user-id']
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })

  const users = loadUsers()
  if (!users[userId]) return res.status(404).json({ error: 'User not found' })

  const { name, senderName, senderEmail, modelId, campaignMode, emailProvider, resumeText, prompt } = req.body

  if (name          !== undefined) users[userId].name          = name
  if (senderName    !== undefined) users[userId].senderName    = senderName
  if (senderEmail   !== undefined) users[userId].senderEmail   = senderEmail
  if (modelId       !== undefined) users[userId].modelId       = modelId
  if (campaignMode  !== undefined) users[userId].campaignMode  = campaignMode
  if (emailProvider !== undefined) users[userId].emailProvider = emailProvider
  if (resumeText    !== undefined) users[userId].resumeText    = resumeText
  if (prompt        !== undefined) users[userId].prompt        = prompt

  saveUsers(users)
  res.json({ ok: true })
})

// ── Prompt templates ──────────────────────────────────────────────────────────

/**
 * GET /api/prompts/templates
 *
 * Reads pre-written email drafting prompts from disk and returns them.
 * Templates are plain-text files in the repository root.
 * Missing files are silently skipped (logged as a warning).
 *
 * Response: [{ name, filename, content }]
 */
router.get('/prompts/templates', (req, res) => {
  const templateFiles = [
    { name: 'Financial',  filename: 'DraftingPrompt.txt' },
    { name: 'Recruiters', filename: 'RecruitersDraftingPrompt.txt' },
    { name: 'Research',   filename: 'Research Prompt.txt' },
  ]

  const templates = []
  for (const { name, filename } of templateFiles) {
    try {
      const content = readFileSync(join(ROOT, filename), 'utf8')
      templates.push({ name, filename, content })
    } catch {
      console.warn(`[user] Template not found: ${filename}`)
    }
  }

  res.json(templates)
})

export default router
