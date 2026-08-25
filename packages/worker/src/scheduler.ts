import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { enqueueWorkflow } from "./queue";

interface RawNode {
  id: string;
  data: Record<string, unknown>;
}

const activeTasks = new Map<string, cron.ScheduledTask>();

export async function startScheduler(prisma: PrismaClient) {
  await syncSchedules(prisma);
  // Re-sync every minute to pick up newly activated/deactivated workflows
  cron.schedule("* * * * *", () => syncSchedules(prisma));
  console.log("[Scheduler] Running");
}

async function syncSchedules(prisma: PrismaClient) {
  const activeWorkflows = await prisma.workflow.findMany({ where: { active: true } });

  const desired = new Map<string, { expr: string; timezone?: string }>(); // workflowId → schedule config

  for (const wf of activeWorkflows) {
    const nodes = wf.nodes as RawNode[];
    const scheduleNode = nodes.find((n) => n.data?.nodeType === "scheduleTrigger");
    if (!scheduleNode) continue;
    const expr = String(scheduleNode.data?.cronExpression || "");
    if (!expr || !cron.validate(expr)) continue;
    const timezone = scheduleNode.data?.timezone ? String(scheduleNode.data.timezone) : undefined;
    desired.set(wf.id, { expr, timezone });
  }

  // Stop tasks no longer needed
  for (const [wfId, task] of activeTasks) {
    if (!desired.has(wfId)) {
      task.stop();
      activeTasks.delete(wfId);
      console.log(`[Scheduler] Stopped schedule for workflow ${wfId}`);
    }
  }

  // Start new tasks
  for (const [wfId, { expr, timezone }] of desired) {
    if (activeTasks.has(wfId)) continue; // already running
    const task = cron.schedule(expr, async () => {
      try {
        const execution = await prisma.execution.create({
          data: { workflowId: wfId, status: "PENDING" },
        });
        await enqueueWorkflow({ workflowId: wfId, executionId: execution.id, triggerData: { _trigger: "schedule", _now: new Date().toISOString() } });
        console.log(`[Scheduler] Triggered workflow ${wfId} execution ${execution.id}`);
      } catch (err) {
        console.error(`[Scheduler] Failed to trigger workflow ${wfId}:`, err);
      }
    }, { timezone: timezone || "UTC" });
    activeTasks.set(wfId, task);
    console.log(`[Scheduler] Registered schedule "${expr}"${timezone ? ` (${timezone})` : ""} for workflow ${wfId}`);
  }
}
