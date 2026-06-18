/**
 * server/routes/user.js
 *
 * User account management: login, signup, profile read/update.
 * Backed by PostgreSQL (Prisma User model) — no filesystem dependency.
 */

import { Router }               from 'express'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join }                 from 'path'
import {
  getUser, getUserByEmail, createUser, updateUser,
  hashPassword, verifyPassword,
} from '../lib/users.js'
import { ROOT }                      from '../lib/config.js'
import { loginLimiter, requireAuth } from '../lib/middleware.js'

const router = Router()

// ── Login ─────────────────────────────────────────────────────────────────────

router.post('/user/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' })
  }

  const user = await getUserByEmail(email.trim().toLowerCase())
  if (!user) return res.status(401).json({ error: 'Invalid email or password' })

  const valid = await verifyPassword(password, user.password)
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' })

  res.json({ ok: true, userId: user.id, name: user.name, email: user.email })
})

// ── Signup ────────────────────────────────────────────────────────────────────

router.post('/user/signup', loginLimiter, async (req, res) => {
  const { email, name, password } = req.body

  if (!email?.trim() || !name?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'All fields are required' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  const existing = await getUserByEmail(email.trim().toLowerCase())
  if (existing) return res.status(409).json({ error: 'Email already in use' })

  const userId       = `${email.split('@')[0]}-${Date.now().toString(36)}`
  const passwordHash = await hashPassword(password)

  const user = await createUser({
    id:            userId,
    email:         email.trim().toLowerCase(),
    name:          name.trim(),
    password:      passwordHash,
    senderName:    name.trim(),
    senderEmail:   email.trim().toLowerCase(),
    modelId:       'gpt-4o-mini',
    campaignMode:  'startup',
    emailProvider: 'gmail',
  })

  res.json({ ok: true, userId: user.id, name: user.name, email: user.email })
})

// ── Profile GET ───────────────────────────────────────────────────────────────

router.get('/user/profile', requireAuth, async (req, res) => {
  const user = await getUser(req.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })

  res.json({
    name:            user.name,
    email:           user.email,
    senderName:      user.senderName,
    senderEmail:     user.senderEmail,
    linkedinUrl:     user.linkedinUrl || null,
    phoneNumber:     user.phoneNumber || null,
    modelId:         user.modelId,
    campaignMode:    user.campaignMode,
    emailProvider:   user.emailProvider,
    resumeText:      user.resumeText  || null,
    prompt:          user.prompt      || null,
    hasGmailToken:   !!(user.gmailTokens),
    hasOutlookToken: !!(user.outlookTokens),
  })
})

// ── Profile PUT ───────────────────────────────────────────────────────────────

router.put('/user/profile', requireAuth, async (req, res) => {
  const allowed = ['name', 'senderName', 'senderEmail', 'linkedinUrl', 'phoneNumber', 'modelId', 'campaignMode', 'emailProvider', 'resumeText', 'prompt']
  const patch   = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) patch[key] = req.body[key]
  }
  await updateUser(req.userId, patch)
  res.json({ ok: true })
})

// ── Prompt templates ──────────────────────────────────────────────────────────

router.get('/prompts/templates', (req, res) => {
  try {
    const dir = join(ROOT, 'server', 'prompts')
    if (!existsSync(dir)) return res.json([])
    const files = readdirSync(dir).filter(f => f.endsWith('.txt'))
    const templates = files.map(f => ({
      name:    f.replace('.txt', ''),
      content: readFileSync(join(dir, f), 'utf8'),
    }))
    res.json(templates)
  } catch {
    res.json([])
  }
})

export default router
