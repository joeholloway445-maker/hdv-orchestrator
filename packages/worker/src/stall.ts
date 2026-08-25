/**
 * Stall & crash recovery for BullMQ executions.
 *
 * Two mechanisms:
 *  1. Startup scan — on boot, find any execution rows stuck in RUNNING that
 *     have no corresponding active BullMQ job and mark them FAILED.
 *  2. QueueEvents listener — reacts to BullMQ `stalled` and `failed` events
 *     (including stall-exhaustion failures) and syncs Postgres when the normal
 *     job-processor catch block never had a chance to run (i.e. process crash).
 *
 * Uses updateMany with { status: "RUNNING" } as the predicate so it is a safe
 * no-op if the normal catch block already set the status to FAILED.
 */

import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";

const QUEUE_NAME = "workflow-execution";

// Executions running longer than this on startup with no active BullMQ job are
// considered orphaned (process died before completion).
const ORPHAN_THRESHOLD_MS = Number(process.env.STALL_ORPHAN_THRESHOLD_MS) || 15 * 60 * 1000;

export async function startStallRecovery(prisma: PrismaClient): Promise<() => Promise<void>> {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  const queueConn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const eventsConn = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const queue = new Queue(QUEUE_NAME, { connection: queueConn });
  const queueEvents = new QueueEvents(QUEUE_NAME, { connection: eventsConn });

  // ── 1. Startup orphan scan ─────────────────────────────────────────────────

  await recoverOrphans(prisma, queue);

  // ── 2. Runtime stall listener ──────────────────────────────────────────────

  // `stalled` fires when a job's lock expires — the process may have crashed.
  // BullMQ will retry up to maxStalledCount times; we mark the Postgres row
  // FAILED immediately so the UI reflects reality. If a retry subsequently
  // succeeds, the job processor will set it to SUCCESS (overwriting us).
  queueEvents.on("stalled", async ({ jobId }) => {
    console.warn(`[StallRecovery] Job ${jobId} stalled`);
    await syncFailedExecution(prisma, queue, jobId, "Worker process stalled or crashed");
  });

  // `failed` fires for every terminal failure, including exhausted stall retries.
  // This is the definitive signal that BullMQ will not retry further.
  queueEvents.on("failed", async ({ jobId, failedReason }) => {
    await syncFailedExecution(
      prisma,
      queue,
      jobId,
      failedReason || "Job failed unexpectedly",
    );
  });

  console.log("[StallRecovery] Watching queue — stalls and crashes will auto-recover");

  // Return a cleanup function for graceful shutdown
  return async () => {
    await queueEvents.close();
    await queue.close();
    await queueConn.quit();
    await eventsConn.quit();
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function syncFailedExecution(
  prisma: PrismaClient,
  queue: Queue,
  jobId: string,
  reason: string,
): Promise<void> {
  try {
    const job = await queue.getJob(jobId);
    const executionId = job?.data?.executionId as string | undefined;
    if (!executionId) return;

    const result = await prisma.execution.updateMany({
      where: { id: executionId, status: { in: ["RUNNING", "PENDING"] } },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        data: { error: `[Stall recovery] ${reason}` },
      },
    });

    if (result.count > 0) {
      console.warn(
        `[StallRecovery] Recovered execution ${executionId} → FAILED (${reason})`,
      );
    }
  } catch (err) {
    console.error("[StallRecovery] Error during sync for job", jobId, err);
  }
}

async function recoverOrphans(prisma: PrismaClient, queue: Queue): Promise<void> {
  const threshold = new Date(Date.now() - ORPHAN_THRESHOLD_MS);

  const stale = await prisma.execution.findMany({
    where: { status: "RUNNING", startedAt: { lt: threshold } },
    select: { id: true },
  });

  if (stale.length === 0) return;

  // Active jobs in BullMQ — cross-reference to avoid killing genuinely running jobs
  const activeJobs = await queue.getActive();
  const activeExecutionIds = new Set(
    activeJobs.map((j) => j.data?.executionId as string | undefined).filter(Boolean),
  );

  const orphans = stale.filter((e) => !activeExecutionIds.has(e.id));
  if (orphans.length === 0) return;

  await prisma.execution.updateMany({
    where: { id: { in: orphans.map((e) => e.id) } },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      data: {
        error:
          "[Stall recovery] Orphaned execution — worker process crashed before completion",
      },
    },
  });

  console.warn(
    `[StallRecovery] Recovered ${orphans.length} orphaned execution(s) on startup`,
  );
}
