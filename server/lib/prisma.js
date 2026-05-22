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
