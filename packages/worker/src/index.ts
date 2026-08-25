import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { executeWorkflow } from "./engine/dag";
import { startScheduler } from "./scheduler";
import { startTestServer } from "./testServer";

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
    const { workflowId, executionId, triggerData } = job.data as {
      workflowId: string;
      executionId: string;
      triggerData: Record<string, unknown>;
    };

    console.log(`[Worker] Execution ${executionId} — workflow ${workflowId}`);

    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "RUNNING", data: { triggerData } },
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
        executeWorkflow({ workflow, executionId, triggerData, publisher, prisma }),
        timeoutPromise,
      ]);

      // Hoist _webhookResponse from any respond node output so the API can poll it
      let webhookResponse: unknown = undefined;
      for (const out of Object.values(finalOutputs)) {
        const wr = (out as Record<string, unknown>)?._webhookResponse;
        if (wr) { webhookResponse = wr; break; }
      }

      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          data: { triggerData, outputs: finalOutputs, ...(webhookResponse ? { webhookResponse } : {}) },
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Execution ${executionId} failed:`, msg);
      await prisma.execution.update({
        where: { id: executionId },
        data: { status: "FAILED", finishedAt: new Date(), data: { triggerData, error: msg } },
      });
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
          const { enqueueWorkflow } = await import("./queue/producer");
          await enqueueWorkflow({ workflowId: errorWfId, executionId: errExec.id, triggerData: { _error: msg, _workflowId: workflowId, _executionId: executionId } });
        }
      }
    }
  },
  { connection }
);

worker.on("completed", (job) => console.log(`[Worker] Job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`[Worker] Job ${job?.id} failed:`, err.message));

console.log("[Worker] Listening on workflow-execution queue...");

startScheduler(prisma).catch((err) => console.error("[Scheduler] Failed to start:", err));
startTestServer(prisma);
