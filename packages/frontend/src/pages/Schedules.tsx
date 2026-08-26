import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { StatusChip } from "../components/StatusChip";
import { TimeAgo } from "../components/TimeAgo";

interface ScheduleEntry {
  workflowId: string;
  workflowName: string;
  active: boolean;
  cronExpression: string;
  timezone: string;
  lastRun: { startedAt: string; status: string } | null;
}

/**
 * Very basic "next run" approximation for common cron patterns.
 * Returns a human-readable string like "in ~1 hour" or falls back to a note
 * that the exact time depends on the cron expression.
 */
function approximateNextRun(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "see cron";
  const [minute, hour, dom, , dow] = parts;

  // Every minute: * * * * *
  if (minute === "*" && hour === "*") return "every minute";

  // Every N minutes: */N * * * *
  if (minute.startsWith("*/") && hour === "*") {
    const n = parseInt(minute.slice(2));
    return isNaN(n) ? "see cron" : `every ${n} min`;
  }

  // Hourly: 0 * * * *  or  M * * * *
  if (hour === "*" && dom === "*") {
    return `every hour`;
  }

  // Every N hours: 0 */N * * *
  if (hour.startsWith("*/") && minute === "0") {
    const n = parseInt(hour.slice(2));
    return isNaN(n) ? "see cron" : `every ${n} hours`;
  }

  // Daily at H:M  — 0 H * * *
  if (dom === "*" && dow === "*" && !hour.includes("*") && !minute.includes("*")) {
    const h = parseInt(hour);
    const m = parseInt(minute);
    if (!isNaN(h) && !isNaN(m)) {
      const next = new Date();
      next.setHours(h, m, 0, 0);
      if (next <= new Date()) next.setDate(next.getDate() + 1);
      const diffMs = next.getTime() - Date.now();
      const diffH = Math.round(diffMs / 3600000);
      return diffH < 1 ? "soon" : `in ~${diffH}h`;
    }
  }

  return "scheduled";
}

export function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/schedules");
      setSchedules(data as ScheduleEntry[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(entry: ScheduleEntry) {
    setToggling(entry.workflowId);
    try {
      await api.patch(`/workflows/${entry.workflowId}`, { active: !entry.active });
      setSchedules((prev) =>
        prev.map((s) =>
          s.workflowId === entry.workflowId ? { ...s, active: !s.active } : s
        )
      );
    } finally {
      setToggling(null);
    }
  }

  async function deleteSchedule(entry: ScheduleEntry) {
    if (!confirm(`Remove schedule from "${entry.workflowName}"?\n\nThis will deactivate the workflow, disabling automatic runs.`)) return;
    setDeleting(entry.workflowId);
    try {
      // Deactivate the workflow to stop scheduled execution
      await api.patch(`/workflows/${entry.workflowId}`, { active: false });
      setSchedules((prev) => prev.filter((s) => s.workflowId !== entry.workflowId));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#060A14] text-white">
      <header className="bg-[#0E1524] border-b border-[#1e2d4a] px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          ← Dashboard
        </button>
        <h1 className="text-xl font-bold">Schedules</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">{schedules.length} scheduled workflow{schedules.length !== 1 ? "s" : ""}</span>
          <button
            onClick={load}
            className="px-3 py-1.5 bg-[#0E1524] border border-[#1e2d4a] hover:border-[#3B6FFF] rounded-lg text-sm transition-colors text-gray-300"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-gray-400 text-sm mb-6">
          Workflows with a <strong className="text-gray-300">Schedule Trigger</strong> node. Pause or resume each schedule independently.
        </p>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-[#0E1524] border border-[#1e2d4a] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-20 bg-[#0E1524] border border-[#1e2d4a] rounded-2xl">
            <p className="text-xl text-gray-400 mb-2">No scheduled workflows</p>
            <p className="text-sm text-gray-600 mb-4">
              Add a <strong className="text-gray-400">Schedule Trigger</strong> node to a workflow to set up automated runs.
            </p>
            <button
              onClick={() => navigate("/")}
              className="text-[#3B6FFF] hover:underline text-sm"
            >
              Go to workflows →
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#1e2d4a]">
            <table className="w-full text-sm">
              <thead className="bg-[#0E1524] text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">Workflow</th>
                  <th className="px-5 py-3 text-left">Cron</th>
                  <th className="px-5 py-3 text-left">Next Run</th>
                  <th className="px-5 py-3 text-left">Last Run</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr
                    key={s.workflowId}
                    className="border-t border-[#1e2d4a] bg-[#060A14] hover:bg-[#0E1524] transition-colors"
                  >
                    <td className="px-5 py-4">
                      <button
                        onClick={() => navigate(`/workflow/${s.workflowId}`)}
                        className="font-medium text-[#3B6FFF] hover:underline truncate max-w-[200px] block"
                      >
                        {s.workflowName}
                      </button>
                      <span className="text-xs text-gray-600">{s.timezone}</span>
                    </td>
                    <td className="px-5 py-4">
                      <code className="bg-[#0E1524] border border-[#1e2d4a] rounded px-2 py-1 text-xs font-mono text-purple-300">
                        {s.cronExpression}
                      </code>
                    </td>
                    <td className="px-5 py-4 text-gray-300 text-sm">
                      {s.active ? (
                        <span className="text-green-400">{approximateNextRun(s.cronExpression)}</span>
                      ) : (
                        <span className="text-gray-600">paused</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {s.lastRun ? (
                        <div className="flex items-center gap-2">
                          <StatusChip status={s.lastRun.status} />
                          <TimeAgo date={s.lastRun.startedAt} className="text-xs text-gray-500" />
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs">Never</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          s.active
                            ? "bg-green-900/40 text-green-400"
                            : "bg-gray-800 text-gray-500"
                        }`}
                      >
                        {s.active ? (
                          <><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />Active</>
                        ) : (
                          "Paused"
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleActive(s)}
                          disabled={toggling === s.workflowId}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
                            s.active
                              ? "bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50"
                              : "bg-green-900/30 text-green-400 hover:bg-green-900/50"
                          }`}
                        >
                          {toggling === s.workflowId ? "…" : s.active ? "Pause" : "Resume"}
                        </button>
                        <button
                          onClick={() => deleteSchedule(s)}
                          disabled={deleting === s.workflowId}
                          className="px-3 py-1 rounded-lg text-xs font-medium bg-red-950/30 text-red-400 hover:bg-red-950/50 transition-colors disabled:opacity-40"
                        >
                          {deleting === s.workflowId ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
