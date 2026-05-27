-- Add reply tracking fields to Email model
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "gmailMessageId" TEXT;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "gmailThreadId" TEXT;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3);

-- Index for efficient thread lookup
CREATE INDEX IF NOT EXISTS "Email_gmailThreadId_idx" ON "Email"("gmailThreadId");
