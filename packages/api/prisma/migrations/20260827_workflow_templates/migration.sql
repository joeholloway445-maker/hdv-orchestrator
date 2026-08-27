CREATE TABLE IF NOT EXISTS "WorkflowTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "tier" TEXT NOT NULL DEFAULT 'FREE',
  "nodes" JSONB NOT NULL,
  "edges" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);
