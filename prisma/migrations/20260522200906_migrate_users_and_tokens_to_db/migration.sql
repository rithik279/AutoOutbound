-- AlterTable
ALTER TABLE "User" ADD COLUMN     "campaignMode" TEXT NOT NULL DEFAULT 'startup',
ADD COLUMN     "emailProvider" TEXT NOT NULL DEFAULT 'gmail',
ADD COLUMN     "gmailTokens" JSONB,
ADD COLUMN     "modelId" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
ADD COLUMN     "outlookTokens" JSONB,
ADD COLUMN     "password" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "prompt" TEXT,
ADD COLUMN     "resumeText" TEXT,
ADD COLUMN     "senderEmail" TEXT,
ADD COLUMN     "senderName" TEXT;
