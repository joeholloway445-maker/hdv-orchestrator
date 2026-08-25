import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

interface NodeLog {
  id: string;
  nodeId: string;
  nodeType: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

interface ExecutionRow {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  workflowId: string;
  workflow?: { id: string; name: string };
}

interface ExecutionDetail extends ExecutionRow {
  nodeLogs: NodeLog[];
}

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: "bg-green-900 text-green-300",
  ERROR: "bg-red-900 text-red-300",
  PENDING: "bg-yellow-900 text-yellow-300",
  RUNNING: "bg-blue-900 text-blue-300",
  SKIPPED: "bg-gray-800 text-gray-500",
};

function ms(startedAt: string, finishedAt?: string) {
  if (!finishedAt) return "—";
  return `${Math.round(new Date(finishedAt).getTime() - new Date(startedAt).getTime())}ms`;
}

function NodeLogRow({ log }: { log: NodeLog }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-3 py-2 bg-gray-900 hover:bg-gray-800 text-left transition"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${STATUS_COLORS[log.status] || "bg-gray-700 text-gray-300"}`}>
          {log.status}
        </span>
        <span className="text-xs text-gray-300 font-mono flex-1">{log.nodeType} <span className="text-gray-600">({log.nodeId.slice(0, 10)}…)</span></span>
        <span className="text-xs text-gray-500">{ms(log.startedAt, log.finishedAt)}</span>
        <span className="text-gray-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="bg-gray-950 px-3 py-2 space-y-2 text-xs">
          {log.error && (
            <div>
              <span className="text-red-400 font-semibold">Error: </span>
              <pre className="text-red-300 whitespace-pre-wrap break-words mt-1">{log.error}</pre>
            </div>
          )}
          {log.input !== undefined && (
            <div>
              <span className="text-gray-500 font-semibold">Input</span>
              <pre className="bg-gray-900 text-gray-400 rounded p-2 mt-1 overflow-auto max-h-40 whitespace-pre-wrap">
                {JSON.stringify(log.input, null, 2)}
              </pre>
            </div>
          )}
          {log.output !== undefined && (
            <div>
              <span className="text-gray-500 font-semibold">Output</span>
              <pre className="bg-gray-900 text-green-400 rounded p-2 mt-1 overflow-auto max-h-40 whitespace-pre-wrap">
                {JSON.stringify(log.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExecutionDetailPanel({ execution, onClose }: { execution: ExecutionDetail; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h2 className="font-semibold text-white">Execution Detail</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{execution.id}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${STATUS_COLORS[execution.status] || "bg-gray-700 text-gray-300"}`}>
              {execution.status}
            </span>
            <span className="text-gray-500 text-xs">{ms(execution.startedAt, execution.finishedAt)}</span>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {execution.nodeLogs.length === 0 ? (
            <p className="text-gray-600 text-sm">No node logs yet.</p>
          ) : (
            execution.nodeLogs.map((log) => <NodeLogRow key={log.id} log={log} />)
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-700 flex justify-between items-center">
          {execution.workflow && (
            <Link to={`/workflow/${execution.workflowId}`} className="text-sm text-blue-400 hover:underline">
              Open in Editor →
            </Link>
          )}
          <span />
        </div>
      </div>
    </div>
  );
}

export function ExecutionsPage() {
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

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

  async function openDetail(e: ExecutionRow) {
    const { data } = await api.get(`/executions/${e.id}`);
    const full = data as ExecutionDetail;
    setDetail({ ...e, nodeLogs: full.nodeLogs || [] });
  }

  async function deleteExecution(e: ExecutionRow, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!confirm("Delete this execution record?")) return;
    await api.delete(`/executions/${e.id}`);
    setExecutions((prev) => prev.filter((x) => x.id !== e.id));
  }

  async function retry(e: ExecutionRow, ev: React.MouseEvent) {
    ev.stopPropagation();
    setRetrying(e.id);
    try {
      const { data } = await api.post(`/executions/${e.id}/retry`);
      const fresh = data as ExecutionRow;
      setExecutions((prev) => [fresh, ...prev]);
    } finally {
      setRetrying(null);
    }
  }

  const filtered = filter
    ? executions.filter(
        (e) =>
          e.status === filter.toUpperCase() ||
          e.workflow?.name?.toLowerCase().includes(filter.toLowerCase()) ||
          e.workflowId.includes(filter),
      )
    : executions;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {detail && <ExecutionDetailPanel execution={detail} onClose={() => setDetail(null)} />}

      <header className="border-b border-gray-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
          <h1 className="text-xl font-bold">All Executions</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {["", "SUCCESS", "FAILED", "RUNNING", "PENDING"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === s
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {s || "All"}
            </button>
          ))}
          <input
            className="bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
            placeholder="Search by name…"
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
                    className={`border-t border-gray-800 cursor-pointer hover:bg-gray-900/60 transition ${idx % 2 === 0 ? "bg-gray-950" : "bg-gray-900/30"}`}
                    onClick={() => openDetail(e)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{e.id.slice(0, 12)}…</td>
                    <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      {e.workflow ? (
                        <Link to={`/workflow/${e.workflowId}`} className="text-blue-400 hover:underline">
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
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(e.startedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{ms(e.startedAt, e.finishedAt)}</td>
                    <td className="px-4 py-3 flex items-center gap-2" onClick={(ev) => ev.stopPropagation()}>
                      <button
                        className="text-xs text-blue-400 hover:underline"
                        onClick={() => openDetail(e)}
                      >
                        Logs
                      </button>
                      {(e.status === "FAILED" || e.status === "SUCCESS") && (
                        <button
                          className="text-xs text-yellow-400 hover:underline disabled:opacity-50"
                          disabled={retrying === e.id}
                          onClick={(ev) => retry(e, ev)}
                        >
                          {retrying === e.id ? "…" : "Retry"}
                        </button>
                      )}
                      <button
                        className="text-xs text-red-400 hover:underline"
                        onClick={(ev) => deleteExecution(e, ev)}
                      >
                        Delete
                      </button>
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
