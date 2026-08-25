import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const workflowQueue = new Queue("workflow-execution", { connection });

export interface WorkflowJob {
  workflowId: string;
  executionId: string;
  triggerData: Record<string, unknown>;
  checkpointExecutionId?: string;
  /** Nesting depth for sub-workflow calls; enforces max depth guard. */
  executionDepth?: number;
  /** When set, the job is delayed by this many milliseconds (for wait node resumption). */
  delayMs?: number;
}

export async function enqueueWorkflow(job: WorkflowJob) {
  const { delayMs, ...data } = job;
  return workflowQueue.add("execute", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    ...(delayMs ? { delay: delayMs } : {}),
  });
}
