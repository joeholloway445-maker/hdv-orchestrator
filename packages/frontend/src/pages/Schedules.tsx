import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface ScheduleEntry {
  workflowId: string;
  workflowName: string;
  active: boolean;
  cronExpression: string;
  timezone: string;
  lastRun: { startedAt: string; status: string } | null;
}

function statusColor(status: string) {
  if (status === "COMPLETED") return "text-green-400";
  if (status === "FAILED") return "text-red-400";
  if (status === "RUNNING") return "text-yellow-400";
  return "text-gray-400";
}

export function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    const { data } = await api.get("/schedules");
    setSchedules(data as ScheduleEntry[]);
    setLoading(false);
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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white text-sm transition"
        >
          ← Dashboard
        </button>
        <h1 className="text-xl font-bold">Schedules</h1>
        <button
          onClick={load}
          className="ml-auto px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
        >
          Refresh
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <p className="text-gray-400 text-sm">
          All workflows with Schedule Trigger nodes. Toggle active to enable or disable automatic execution.
        </p>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : schedules.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No scheduled workflows found</p>
            <p className="text-sm mt-2">
              Add a <strong>Schedule Trigger</strong> node to a workflow to set up automated runs.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((s) => (
              <div
                key={s.workflowId}
                className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <button
                      onClick={() => navigate(`/workflow/${s.workflowId}`)}
                      className="font-semibold text-blue-400 hover:underline truncate block"
                    >
                      {s.workflowName}
                    </button>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      {s.active ? (
                        <span className="text-green-400">● Active</span>
                      ) : (
                        <span className="text-gray-600">○ Inactive</span>
                      )}
                      <span className="text-gray-600">·</span>
                      <span>{s.timezone}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => toggleActive(s)}
                    disabled={toggling === s.workflowId}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition shrink-0 ${
                      s.active
                        ? "bg-green-900/40 text-green-400 hover:bg-red-900/40 hover:text-red-400"
                        : "bg-gray-700 text-gray-400 hover:bg-green-900/40 hover:text-green-400"
                    } disabled:opacity-40`}
                  >
                    {toggling === s.workflowId
                      ? "..."
                      : s.active
                      ? "Disable"
                      : "Enable"}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Cron:</span>
                  <code className="flex-1 bg-gray-900 rounded px-3 py-2 text-xs font-mono text-purple-300">
                    {s.cronExpression}
                  </code>
                </div>

                {s.lastRun ? (
                  <p className="text-xs text-gray-500">
                    Last run:{" "}
                    <span className={statusColor(s.lastRun.status)}>
                      {s.lastRun.status}
                    </span>
                    {" · "}
                    {new Date(s.lastRun.startedAt).toLocaleString()}
                  </p>
                ) : (
                  <p className="text-xs text-gray-600">No executions recorded yet</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
