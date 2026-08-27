-- Add byokApiKey to User for BYOK tenant API key storage
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "byokApiKey" TEXT;
