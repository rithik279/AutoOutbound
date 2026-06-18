-- Add authoritative profile contact fields for drafting and settings
ALTER TABLE "User"
ADD COLUMN "linkedinUrl" TEXT,
ADD COLUMN "phoneNumber" TEXT;
