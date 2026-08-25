import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const workflowQueue = new Queue("workflow-execution", { connection });

export interface WorkflowJob {
  workflowId: string;
  executionId: string;
  triggerData: Record<string, unknown>;
  /** When set, successful node outputs from this prior execution are used as checkpoints. */
  checkpointExecutionId?: string;
  /** Nesting depth for sub-workflow calls; enforces max depth guard. */
  executionDepth?: number;
}

export async function enqueueWorkflow(job: WorkflowJob) {
  return workflowQueue.add("execute", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
  });
}
