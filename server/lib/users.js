/**
 * server/lib/users.js
 *
 * User account management backed by a local JSON file (users.json).
 * Passwords are stored as bcrypt hashes — never plaintext.
 *
 * Why JSON file instead of Prisma?
 *   The app was originally built with a flat-file store and migrating
 *   auth to the database is a larger task. The file is gitignored and
 *   only exists on the server. For multi-server deployments, migrate to
 *   a database-backed store using the Prisma User model.
 *
 * Exports:
 *   loadUsers()                  → { [userId]: UserRecord }
 *   saveUsers(users)             → void
 *   hashPassword(plain)          → Promise<string>   (bcrypt hash, cost=10)
 *   verifyPassword(plain, hash)  → Promise<boolean>
 *   migratePasswordsIfNeeded()   → Promise<void>    (run once at startup)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import bcrypt from 'bcryptjs'
import { USERS_PATH } from './config.js'

const BCRYPT_ROUNDS = 10

// ── Raw file I/O ──────────────────────────────────────────────────────────────

/**
 * Load all users from disk. Returns an empty object if the file doesn't exist
 * or is corrupted — never throws.
 *
 * @returns {{ [userId: string]: object }}
 */
export function loadUsers() {
  try {
    return existsSync(USERS_PATH) ? JSON.parse(readFileSync(USERS_PATH, 'utf8')) : {}
  } catch {
    return {}
  }
}

/**
 * Persist the full users map to disk (synchronous write, fine for low traffic).
 *
 * @param {{ [userId: string]: object }} users
 */
export function saveUsers(users) {
  writeFileSync(USERS_PATH, JSON.stringify(users, null, 2))
}

// ── Password helpers ──────────────────────────────────────────────────────────

/**
 * Hash a plaintext password with bcrypt.
 *
 * @param {string} plain
 * @returns {Promise<string>} bcrypt hash
 */
export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

/**
 * Compare a plaintext candidate against a stored bcrypt hash.
 *
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

// ── One-time startup migration ────────────────────────────────────────────────

/**
 * Migrate any plaintext passwords to bcrypt hashes.
 *
 * Called once at server startup. Bcrypt hashes always start with '$2b$', so
 * any password that doesn't have that prefix is assumed to be plaintext.
 * After migration, the file is written back to disk.
 *
 * Safe to call multiple times — already-hashed passwords are left unchanged.
 */
export async function migratePasswordsIfNeeded() {
  const users = loadUsers()
  let changed = false

  for (const [id, user] of Object.entries(users)) {
    if (user.password && !user.password.startsWith('$2b$') && !user.password.startsWith('$2a$')) {
      console.log(`[users] Migrating password for user ${id} to bcrypt hash`)
      users[id].password = await hashPassword(user.password)
      changed = true
    }
  }

  if (changed) {
    saveUsers(users)
    console.log('[users] Password migration complete')
  }
}
