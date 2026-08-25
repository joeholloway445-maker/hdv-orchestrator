import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

interface ExecutionRow {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  workflowId: string;
  workflow?: { id: string; name: string };
}

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: "bg-green-900 text-green-300",
  ERROR: "bg-red-900 text-red-300",
  PENDING: "bg-yellow-900 text-yellow-300",
  RUNNING: "bg-blue-900 text-blue-300",
};

export function ExecutionsPage() {
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/executions?limit=100");
      setExecutions(data as ExecutionRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = filter
    ? executions.filter(
        (e) =>
          e.status === filter ||
          e.workflow?.name?.toLowerCase().includes(filter.toLowerCase()) ||
          e.workflowId.includes(filter),
      )
    : executions;

  function duration(e: ExecutionRow) {
    if (!e.finishedAt) return "—";
    return `${Math.round(new Date(e.finishedAt).getTime() - new Date(e.startedAt).getTime())}ms`;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
          <h1 className="text-xl font-bold">All Executions</h1>
        </div>
        <div className="flex items-center gap-3">
          <input
            className="bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
            placeholder="Filter by name or status…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button onClick={load} className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-3 py-1.5 text-sm transition">
            Refresh
          </button>
        </div>
      </header>

      <div className="px-8 py-6">
        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500">No executions found.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Execution ID</th>
                  <th className="px-4 py-3 text-left">Workflow</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Started</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => (
                  <tr
                    key={e.id}
                    className={`border-t border-gray-800 ${idx % 2 === 0 ? "bg-gray-950" : "bg-gray-900/30"}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{e.id.slice(0, 12)}…</td>
                    <td className="px-4 py-3">
                      {e.workflow ? (
                        <Link
                          to={`/workflow/${e.workflowId}`}
                          className="text-blue-400 hover:underline"
                        >
                          {e.workflow.name}
                        </Link>
                      ) : (
                        <span className="text-gray-500 font-mono text-xs">{e.workflowId}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${STATUS_COLORS[e.status] || "bg-gray-700 text-gray-300"}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(e.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{duration(e)}</td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/workflow/${e.workflowId}`}
                        className="text-xs text-blue-400 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
