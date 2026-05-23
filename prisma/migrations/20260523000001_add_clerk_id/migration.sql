-- Add clerkId column for Clerk authentication
ALTER TABLE "User" ADD COLUMN "clerkId" TEXT;
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");
