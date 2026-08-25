-- AlterTable: add errorWorkflowId and timeoutMs to Workflow
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "errorWorkflowId" TEXT;
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "timeoutMs" INTEGER;
