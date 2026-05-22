/**
 * server/lib/users.js
 *
 * User account management backed by PostgreSQL via Prisma.
 * Replaces the previous users.json flat-file store.
 *
 * Passwords are stored as bcrypt hashes — never plaintext.
 * OAuth tokens (Gmail, Outlook) are stored as JSON in the User record,
 * so they survive server restarts and Render deploys.
 *
 * Exports:
 *   getUser(userId)              → Promise<User | null>
 *   getUserByEmail(email)        → Promise<User | null>
 *   createUser(data)             → Promise<User>
 *   updateUser(userId, data)     → Promise<User>
 *   hashPassword(plain)          → Promise<string>
 *   verifyPassword(plain, hash)  → Promise<boolean>
 *   migratePasswordsIfNeeded()   → Promise<void>  (no-op — kept for compat)
 *
 * Legacy compat shims (drop after full migration):
 *   loadUsers()                  → object  (loads all users as { [id]: User })
 *   saveUsers(users)             → void    (no-op — writes go through updateUser)
 */

import bcrypt from 'bcryptjs'
import { prisma } from './prisma.js'

const BCRYPT_ROUNDS = 10

// ── Password helpers ──────────────────────────────────────────────────────────

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getUser(userId) {
  return prisma.user.findUnique({ where: { id: userId } })
}

export async function getUserByEmail(email) {
  return prisma.user.findUnique({ where: { email } })
}

export async function createUser(data) {
  return prisma.user.create({ data })
}

export async function updateUser(userId, data) {
  return prisma.user.upsert({
    where:  { id: userId },
    update: data,
    create: { id: userId, email: data.email || '', ...data },
  })
}

// ── Legacy shims — used by routes that haven't been fully migrated ─────────────
// These block-read all users from DB and return the old { [id]: obj } shape.
// They are synchronous-looking but actually async — callers must await.

export async function loadUsers() {
  const rows = await prisma.user.findMany()
  const map  = {}
  for (const u of rows) map[u.id] = u
  return map
}

// saveUsers is a no-op — individual saves go through updateUser()
// Kept so any call sites don't crash during migration.
export function saveUsers(_users) {
  // intentional no-op
}

// ── Startup migration ─────────────────────────────────────────────────────────

/**
 * Kept for compatibility — previously migrated plaintext passwords in users.json.
 * Now a no-op since all passwords are stored as bcrypt hashes in the DB from creation.
 * Also seeds any accounts from the legacy users.json file if it still exists.
 */
export async function migratePasswordsIfNeeded() {
  // Try to seed from users.json if it exists (one-time migration)
  try {
    const { existsSync, readFileSync } = await import('fs')
    const { USERS_PATH } = await import('./config.js')
    if (!existsSync(USERS_PATH)) return

    const raw = JSON.parse(readFileSync(USERS_PATH, 'utf8'))
    const ids = Object.keys(raw)
    if (ids.length === 0) return

    let migrated = 0
    for (const [id, u] of Object.entries(raw)) {
      const exists = await prisma.user.findUnique({ where: { id } })
      if (exists) continue

      let password = u.password || ''
      // Migrate plaintext passwords to bcrypt if needed
      if (password && !password.startsWith('$2b$') && !password.startsWith('$2a$')) {
        password = await hashPassword(password)
      }

      await prisma.user.create({
        data: {
          id,
          email:         u.email         || '',
          name:          u.name          || '',
          password,
          senderName:    u.senderName    || u.name || '',
          senderEmail:   u.senderEmail   || u.email || '',
          modelId:       u.modelId       || 'gpt-4o-mini',
          campaignMode:  u.campaignMode  || 'startup',
          emailProvider: u.emailProvider || 'gmail',
          resumeText:    u.resumeText    || null,
          prompt:        u.prompt        || null,
        },
      })
      migrated++
    }
    if (migrated > 0) {
      console.log(`[users] Migrated ${migrated} user(s) from users.json → database`)
    }
  } catch (e) {
    // Non-fatal — if users.json doesn't exist or parse fails, just continue
    if (!e.message?.includes('ENOENT')) {
      console.error('[users] Migration from users.json failed:', e.message)
    }
  }
}
