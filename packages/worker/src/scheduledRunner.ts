/**
 * Scheduled workflow runner — polls the API for active schedules
 * and triggers execution for any that are due.
 *
 * This complements the node-cron scheduler (scheduler.ts) with an
 * API-driven polling loop that can be monitored and extended independently.
 */
import axios from "axios";

const API_URL = process.env.WORKFLOW_API_URL || "http://localhost:4000";
const API_KEY = process.env.WORKFLOW_API_KEY || "";

const POLL_INTERVAL_MS = 60_000; // 60 seconds

interface ScheduleEntry {
  workflowId: string;
  workflowName: string;
  active: boolean;
  cronExpression: string;
  timezone: string;
  lastRun: { startedAt: string; status: string } | null;
}

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "x-api-key": API_KEY,
    Authorization: `Bearer ${API_KEY}`,
  },
  timeout: 10_000,
});

/**
 * Parse a 5-field cron expression and return whether it matches the given Date
 * (ignoring seconds). Fields: minute hour day-of-month month day-of-week.
 */
function cronMatchesNow(expr: string, now: Date): boolean {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    const [minPart, hourPart, domPart, monPart, dowPart] = parts;

    const minute = now.getUTCMinutes();
    const hour = now.getUTCHours();
    const dom = now.getUTCDate();
    const month = now.getUTCMonth() + 1; // 1-12
    const dow = now.getUTCDay(); // 0 (Sun) – 6 (Sat)

    function matches(part: string, value: number): boolean {
      if (part === "*") return true;
      if (part.startsWith("*/")) {
        const step = parseInt(part.slice(2), 10);
        return !isNaN(step) && step > 0 && value % step === 0;
      }
      const num = parseInt(part, 10);
      return !isNaN(num) && num === value;
    }

    return (
      matches(minPart, minute) &&
      matches(hourPart, hour) &&
      matches(domPart, dom) &&
      matches(monPart, month) &&
      matches(dowPart, dow)
    );
  } catch {
    return false;
  }
}

async function pollAndTrigger(): Promise<void> {
  let schedules: ScheduleEntry[] = [];
  try {
    const { data } = await apiClient.get<ScheduleEntry[]>("/schedules");
    schedules = Array.isArray(data) ? data : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduledRunner] Failed to fetch schedules: ${msg}`);
    return;
  }

  const now = new Date();

  for (const schedule of schedules) {
    if (!schedule.active) continue;
    if (!cronMatchesNow(schedule.cronExpression, now)) continue;

    try {
      await apiClient.post(`/workflows/${schedule.workflowId}/run`, {
        triggerData: { _trigger: "api-schedule", _scheduleId: schedule.workflowId, _now: now.toISOString() },
      });
      console.log(
        `[scheduler] triggered workflow ${schedule.workflowId} for schedule ${schedule.workflowId}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[scheduledRunner] Failed to trigger workflow ${schedule.workflowId}: ${msg}`
      );
    }
  }
}

export function startScheduledRunner(): void {
  console.log("[scheduledRunner] Starting — polling every 60s");

  // Run immediately at startup
  pollAndTrigger().catch((err) =>
    console.error("[scheduledRunner] Initial poll error:", err)
  );

  // Then poll on interval
  setInterval(() => {
    pollAndTrigger().catch((err) =>
      console.error("[scheduledRunner] Poll error:", err)
    );
  }, POLL_INTERVAL_MS);
}
