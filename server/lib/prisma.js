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

export const prisma = new PrismaClient()

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
