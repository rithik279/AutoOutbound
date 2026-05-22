/**
 * server/lib/config.js
 *
 * Single source of truth for all server-side configuration.
 * All values are read from environment variables (.env file).
 * No sensitive keys are hardcoded here — set them in .env before running.
 *
 * Usage:
 *   import { OPENAI_KEY, GMAIL, OUTLOOK, TOKENS_PATH } from './config.js'
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// __dirname equivalent for ES modules
const __dirname = dirname(fileURLToPath(import.meta.url))

/** Absolute path to the repository root (two levels up from server/lib/) */
export const ROOT = join(__dirname, '..', '..')

// ── AI provider keys ──────────────────────────────────────────────────────────
// NOTE: Never use VITE_ prefix for server-only secrets — Vite inlines VITE_* vars
// into the browser bundle at build time, exposing them publicly.
export const OPENAI_KEY    = process.env.OPENAI_KEY    || process.env.VITE_OPENAI_KEY    || ''
export const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY || ''

// ── Apollo.io ─────────────────────────────────────────────────────────────────
export const APOLLO_KEY = process.env.APOLLO_KEY || process.env.VITE_APOLLO_KEY || ''

// ── Outlook / Microsoft Graph ─────────────────────────────────────────────────
export const OUTLOOK = {
  clientId:     process.env.OUTLOOK_CLIENT_ID     || '',
  clientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
  senderEmail:  process.env.OUTLOOK_USER          || '',
}

/** File path where the Outlook OAuth access/refresh token is persisted. */
export const TOKENS_PATH = join(ROOT, '.tokens.json')

// ── Gmail / Google OAuth ──────────────────────────────────────────────────────
export const GMAIL = {
  clientId:     process.env.GMAIL_CLIENT_ID     || '',
  clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
  /**
   * Redirect URI must match exactly what is registered in Google Cloud Console.
   * Production: https://auto-outbound.rithiksingh.com/api/gmail/auth-callback
   * Dev: http://localhost:3334/callback
   */
  redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3334/callback',
}

// ── File paths ─────────────────────────────────────────────────────────────────
/** JSON file storing user accounts. Gitignored in production. */
export const USERS_PATH = join(ROOT, 'users.json')

/**
 * The sender's resume attached to every Outlook email.
 * File must exist at this path on the server.
 */
export const RESUME_PATH = join(ROOT, 'Singh_Manmit_2026_03_04.docx')

// ── Server ────────────────────────────────────────────────────────────────────
export const PORT = parseInt(process.env.PORT || '3001', 10)
