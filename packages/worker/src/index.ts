import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { executeWorkflow } from "./engine/dag";

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
      data: { status: "RUNNING" },
    });

    try {
      const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
      if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

      const finalOutputs = await executeWorkflow({ workflow, executionId, triggerData, publisher, prisma });

      await prisma.execution.update({
        where: { id: executionId },
        data: { status: "SUCCESS", finishedAt: new Date(), data: finalOutputs as object },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Execution ${executionId} failed:`, msg);
      await prisma.execution.update({
        where: { id: executionId },
        data: { status: "FAILED", finishedAt: new Date(), data: { error: msg } },
      });
      await publisher.publish(
        "workflow:telemetry",
        JSON.stringify({ type: "execution-failed", executionId, error: msg })
      );
    }
  },
  { connection }
);

worker.on("completed", (job) => console.log(`[Worker] Job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`[Worker] Job ${job?.id} failed:`, err.message));

console.log("[Worker] Listening on workflow-execution queue...");
