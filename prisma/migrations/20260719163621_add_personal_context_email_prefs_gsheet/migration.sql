-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailPreferences" JSONB,
ADD COLUMN     "gsheetId" TEXT,
ADD COLUMN     "gsheetSyncedAt" TIMESTAMP(3),
ADD COLUMN     "personalContext" TEXT;
