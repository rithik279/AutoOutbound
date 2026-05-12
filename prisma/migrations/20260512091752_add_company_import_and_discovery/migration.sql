-- CreateTable
CREATE TABLE "ImportedCompany" (
    "id" SERIAL NOT NULL,
    "apolloOrgId" TEXT,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "industry" TEXT,
    "size" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportedCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledDiscovery" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "runTime" TEXT NOT NULL,
    "dailyQuota" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledDiscovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportedCompany_domain_key" ON "ImportedCompany"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledDiscovery_userId_key" ON "ScheduledDiscovery"("userId");
