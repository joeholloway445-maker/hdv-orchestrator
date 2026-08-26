import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { executeWorkflow } from "./engine/dag";
import { enqueueWorkflow } from "./queue";
import { startScheduler } from "./scheduler";
import { startTestServer } from "./testServer";
import { startStallRecovery } from "./stall";
import { cleanupPayloads, payloadSummary } from "./lib/payload";

const prisma = new PrismaClient();

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const publisher = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "workflow-execution",
  async (job) => {
    const { workflowId, executionId, triggerData, checkpointExecutionId, executionDepth } = job.data as {
      workflowId: string;
      executionId: string;
      triggerData: Record<string, unknown>;
      checkpointExecutionId?: string;
      executionDepth?: number;
    };

    console.log(`[Worker] Execution ${executionId} — workflow ${workflowId}`);

    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "RUNNING", data: JSON.parse(JSON.stringify({ triggerData })) },
    });

    try {
      const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
      if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

      // Concurrency guard
      const maxConcurrency = (workflow as unknown as Record<string, unknown>).maxConcurrency as number | null;
      if (maxConcurrency) {
        const running = await prisma.execution.count({
          where: { workflowId, status: "RUNNING", id: { not: executionId } },
        });
        if (running >= maxConcurrency) {
          throw new Error(`Concurrency limit reached (max ${maxConcurrency} simultaneous executions)`);
        }
      }

      const timeoutMs = ((workflow as unknown as Record<string, unknown>).timeoutMs as number | null) ?? 300_000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timed out after ${timeoutMs / 1000}s`)), timeoutMs)
      );
      const finalOutputs = await Promise.race([
        executeWorkflow({ workflow, executionId, triggerData, publisher, prisma, checkpointExecutionId, executionDepth }),
        timeoutPromise,
      ]);

      // Hoist _webhookResponse from any respond node output so the API can poll it
      let webhookResponse: unknown = undefined;
      for (const out of Object.values(finalOutputs)) {
        const wr = (out as Record<string, unknown>)?._webhookResponse;
        if (wr) { webhookResponse = wr; break; }
      }

      // Summarize final outputs to avoid writing large blobs into the execution row
      const summaryOutputs = Object.fromEntries(
        Object.entries(finalOutputs).map(([k, v]) => [k, payloadSummary(v)])
      );

      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          data: JSON.parse(JSON.stringify({ triggerData, outputs: summaryOutputs, ...(webhookResponse ? { webhookResponse } : {}) })),
        },
      });
      await cleanupPayloads(executionId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Execution ${executionId} failed:`, msg);
      await prisma.execution.update({
        where: { id: executionId },
        data: { status: "FAILED", finishedAt: new Date(), data: JSON.parse(JSON.stringify({ triggerData, error: msg })) },
      });
      await cleanupPayloads(executionId);
      await publisher.publish(
        "workflow:telemetry",
        JSON.stringify({ type: "execution-failed", executionId, error: msg })
      );

      // Trigger error workflow if configured
      const wf = await prisma.workflow.findUnique({ where: { id: workflowId } }).catch(() => null);
      const errorWfId = (wf as Record<string, unknown> | null)?.errorWorkflowId as string | undefined;
      if (errorWfId) {
        const errorWf = await prisma.workflow.findUnique({ where: { id: errorWfId } }).catch(() => null);
        if (errorWf) {
          const errExec = await prisma.execution.create({
            data: { workflowId: errorWfId, status: "PENDING", data: { triggerData: { _error: msg, _workflowId: workflowId, _executionId: executionId } } },
          });
          await enqueueWorkflow({ workflowId: errorWfId, executionId: errExec.id, triggerData: { _error: msg, _workflowId: workflowId, _executionId: executionId } });
        }
      }
    }
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY) || 4,
    lockDuration: 30_000,
    stalledInterval: 15_000,
    maxStalledCount: 1,
  }
);

worker.on("completed", (job) => console.log(`[Worker] Job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`[Worker] Job ${job?.id} failed:`, err.message));

console.log("[Worker] Listening on workflow-execution queue...");

startScheduler(prisma).catch((err) => console.error("[Scheduler] Failed to start:", err));
startTestServer(prisma);

// ── Stall recovery ────────────────────────────────────────────────────────────

let stallCleanup: (() => Promise<void>) | null = null;
startStallRecovery(prisma)
  .then((cleanup) => { stallCleanup = cleanup; })
  .catch((err) => console.error("[StallRecovery] Failed to start:", err));

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Drain in-flight jobs before exiting so locks are released cleanly and
// in-progress executions can finish rather than becoming orphans.

async function shutdown(signal: string) {
  console.log(`[Worker] ${signal} received — draining in-flight jobs...`);
  try {
    await worker.close();         // stop accepting new jobs, await current job
    await stallCleanup?.();       // close QueueEvents listeners
    await prisma.$disconnect();
    connection.disconnect();
    publisher.disconnect();
    console.log("[Worker] Graceful shutdown complete");
  } catch (err) {
    console.error("[Worker] Error during shutdown:", err);
  } finally {
    process.exit(0);
  }
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT",  () => shutdown("SIGINT"));
