/**
 * server/lib/prisma.js
 *
 * Singleton Prisma client shared across all route modules.
 * Import this instead of instantiating PrismaClient directly — multiple
 * instances in the same process cause connection pool exhaustion.
 *
 * Schema: prisma/schema.prisma
 * Models: Contact, Email, User (legacy JSON), ImportedCompany, ScheduledDiscovery
 */

import { PrismaClient } from '@prisma/client'

// Cap Prisma's connection pool. Supabase's session pooler limits total clients
// to 15; with pg-boss also connecting and the old instance overlapping during a
// deploy, an unbounded Prisma pool exhausts the limit and crashes boot
// (EMAXCONNSESSION). connection_limit=3 keeps the footprint small.
const rawUrl = process.env.DATABASE_URL || ''
const dbUrl  = rawUrl && !/[?&]connection_limit=/.test(rawUrl)
  ? rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'connection_limit=3'
  : rawUrl

export const prisma = dbUrl
  ? new PrismaClient({ datasourceUrl: dbUrl })
  : new PrismaClient()

/**
 * Resolve a caller-supplied identifier to the internal User.id.
 *
 * The Clerk frontend passes the Clerk user id (`user_xxx`), but User rows are
 * keyed by an internal id (`emailprefix-timestamp`) with the Clerk id in the
 * separate `clerkId` column. Public OAuth/token routes therefore receive the
 * Clerk id and must map it back to the row id before any `where: { id }` use.
 * Accepts either form (internal id or Clerk id) and returns the internal id,
 * or null if no user matches.
 *
 * @param {string} identifier
 * @returns {Promise<string|null>}
 */
export async function resolveUserId(identifier) {
  if (!identifier) return null
  const user = await prisma.user.findFirst({
    where:  { OR: [{ id: identifier }, { clerkId: identifier }] },
    select: { id: true },
  })
  return user?.id || null
}
