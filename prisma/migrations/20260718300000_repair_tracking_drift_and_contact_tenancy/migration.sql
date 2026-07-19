-- Repair schema drift + introduce Contact multi-tenancy.
--
-- 1) The email-tracking columns and the EmailEvent table were added to the
--    production database via `prisma db push` and never captured as a
--    migration, so fresh databases (and `migrate deploy`) were missing them.
-- 2) Contact previously had no owner and email was globally unique, letting
--    every authenticated user read and mutate every other user's prospects.
--
-- Everything here is idempotent (IF NOT EXISTS / guarded) so it applies
-- cleanly both to fresh databases and to databases that already received
-- these objects via db push.

-- ── Email tracking drift ─────────────────────────────────────────────────────

ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "trackingId" TEXT;
UPDATE "Email" SET "trackingId" = gen_random_uuid()::text WHERE "trackingId" IS NULL;
ALTER TABLE "Email" ALTER COLUMN "trackingId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Email_trackingId_key" ON "Email"("trackingId");
CREATE INDEX IF NOT EXISTS "Email_trackingId_idx" ON "Email"("trackingId");

ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "openCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "clickCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "firstOpenedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "EmailEvent" (
    "id" SERIAL NOT NULL,
    "emailId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "linkUrl" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EmailEvent_emailId_idx" ON "EmailEvent"("emailId");
CREATE INDEX IF NOT EXISTS "EmailEvent_type_idx" ON "EmailEvent"("type");
DO $$ BEGIN
  ALTER TABLE "EmailEvent"
    ADD CONSTRAINT "EmailEvent_emailId_fkey"
    FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Contact multi-tenancy ────────────────────────────────────────────────────

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Backfill owners from the emails sent to each contact.
UPDATE "Contact" c SET "userId" = sub."userId"
FROM (
  SELECT "contactId", MIN("userId") AS "userId"
  FROM "Email"
  GROUP BY "contactId"
) sub
WHERE c."id" = sub."contactId" AND c."userId" IS NULL;

-- Contacts never emailed by anyone can't be attributed — park them under a
-- sentinel owner no real account uses (recoverable by manual reassignment).
UPDATE "Contact" SET "userId" = 'legacy-unowned' WHERE "userId" IS NULL;

ALTER TABLE "Contact" ALTER COLUMN "userId" SET NOT NULL;

-- Per-user uniqueness replaces the old global email uniqueness.
DROP INDEX IF EXISTS "Contact_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_userId_email_key" ON "Contact"("userId", "email");
CREATE INDEX IF NOT EXISTS "Contact_userId_idx" ON "Contact"("userId");
