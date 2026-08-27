-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE', 'BYOK');

-- CreateEnum
CREATE TYPE "GpuListingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'OFFLINE');

-- AlterTable: add subscription + tenant fields to User
ALTER TABLE "User"
  ADD COLUMN "plan"            "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "tenantId"        TEXT,
  ADD COLUMN "byokBaseUrl"     TEXT,
  ADD COLUMN "byokModel"       TEXT,
  ADD COLUMN "maxActiveParams" INTEGER;

-- CreateIndex: tenantId must be unique when set
CREATE UNIQUE INDEX "User_tenantId_key" ON "User"("tenantId");

-- CreateTable: GPU marketplace listings
CREATE TABLE "GpuListing" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "label"       TEXT NOT NULL,
    "gpuModel"    TEXT NOT NULL,
    "vramGb"      INTEGER NOT NULL,
    "ratePerHour" DOUBLE PRECISION NOT NULL,
    "status"      "GpuListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "endpointUrl" TEXT NOT NULL,
    "apiKeyHash"  TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GpuListing_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GpuListing"
  ADD CONSTRAINT "GpuListing_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
