CREATE TABLE IF NOT EXISTS "HopeCompanion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "mood" TEXT NOT NULL DEFAULT 'idle',
  "executionStatus" TEXT NOT NULL DEFAULT 'idle',
  "lastActive" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HopeCompanion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HopeCompanion_tenantId_key" ON "HopeCompanion"("tenantId");
