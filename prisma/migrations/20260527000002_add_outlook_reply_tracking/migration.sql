-- Add Outlook reply tracking fields to Email model
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "outlookMessageId" TEXT;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "outlookConversationId" TEXT;

-- Index for efficient conversation lookup
CREATE INDEX IF NOT EXISTS "Email_outlookConversationId_idx" ON "Email"("outlookConversationId");
