CREATE TABLE IF NOT EXISTS "ApiToken" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApiToken_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT '{}';
