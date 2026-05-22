/*
  Warnings:

  - Added the required column `scheduledAt` to the `Email` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "scheduledAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Email_userId_idx" ON "Email"("userId");

-- CreateIndex
CREATE INDEX "Email_scheduledAt_idx" ON "Email"("scheduledAt");

-- CreateIndex
CREATE INDEX "Email_sentAt_idx" ON "Email"("sentAt");

-- CreateIndex
CREATE INDEX "ImportedCompany_userId_idx" ON "ImportedCompany"("userId");

-- CreateIndex
CREATE INDEX "ImportedCompany_status_idx" ON "ImportedCompany"("status");
