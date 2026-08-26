import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { StatusChip } from "../components/StatusChip";
import { TimeAgo } from "../components/TimeAgo";

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
  data?: { note?: string; [key: string]: unknown };
}

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: "bg-green-900 text-green-300",
  FAILED: "bg-red-900 text-red-300",
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

function ExecutionDetailPanel({ execution, onClose, onNoteUpdate }: { execution: ExecutionDetail; onClose: () => void; onNoteUpdate?: (note: string) => void }) {
  const [note, setNote] = useState(execution.data?.note ?? "");
  const [savingNote, setSavingNote] = useState(false);

  async function saveNote() {
    setSavingNote(true);
    try {
      await api.patch(`/executions/${execution.id}`, { note });
      onNoteUpdate?.(note);
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
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
        <div className="px-5 pt-3 pb-2">
          <div className="flex gap-2 items-start">
            <textarea
              className="flex-1 bg-gray-800 text-white text-xs rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 border border-gray-700"
              rows={2}
              placeholder="Add a note about this execution…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              onClick={saveNote}
              disabled={savingNote}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded px-3 py-1.5 transition whitespace-nowrap"
            >
              {savingNote ? "…" : "Save note"}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-2">
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
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify({ id: execution.id, status: execution.status, startedAt: execution.startedAt, finishedAt: execution.finishedAt, note, nodeLogs: execution.nodeLogs }, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `execution-${execution.id.slice(0, 8)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="text-xs text-gray-400 hover:text-white transition"
          >
            ↓ Download JSON
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExecutionsPage() {
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [workflowFilter, setWorkflowFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const navigate = useNavigate();

  function buildParams(extra?: Record<string, string>) {
    const p = new URLSearchParams({ limit: "50" });
    if (statusFilter) p.set("status", statusFilter);
    if (workflowFilter) p.set("workflowId", workflowFilter);
    if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p.toString();
  }

  async function load(sf = statusFilter, wf = workflowFilter) {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "50" });
      if (sf) p.set("status", sf);
      if (wf) p.set("workflowId", wf);
      const { data } = await api.get(`/executions?${p.toString()}`);
      const payload = data as { items?: ExecutionRow[]; nextCursor?: string | null } | ExecutionRow[];
      const list = Array.isArray(payload) ? payload : (payload.items ?? []);
      const cursor = Array.isArray(payload) ? null : (payload.nextCursor ?? null);
      setExecutions(list as ExecutionRow[]);
      setNextCursor(cursor);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get(`/executions?${buildParams({ cursor: nextCursor })}`);
      const payload = data as { items?: ExecutionRow[]; nextCursor?: string | null } | ExecutionRow[];
      const list = Array.isArray(payload) ? payload : (payload.items ?? []);
      const cursor = Array.isArray(payload) ? null : (payload.nextCursor ?? null);
      setExecutions((prev) => [...prev, ...list as ExecutionRow[]]);
      setNextCursor(cursor);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => load(), 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, statusFilter, workflowFilter]);

  async function openDetail(e: ExecutionRow) {
    const { data } = await api.get(`/executions/${e.id}`);
    const full = data as ExecutionDetail;
    setDetail({ ...e, nodeLogs: full.nodeLogs || [], data: full.data });
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

  async function cancel(e: ExecutionRow, ev: React.MouseEvent) {
    ev.stopPropagation();
    setCancelling(e.id);
    try {
      const { data } = await api.post(`/executions/${e.id}/cancel`);
      const updated = data as ExecutionRow;
      setExecutions((prev) => prev.map((x) => x.id === e.id ? { ...x, status: updated.status } : x));
    } finally {
      setCancelling(null);
    }
  }

  async function bulkDelete(status: string) {
    if (!confirm(`Delete all ${status || "selected"} executions?`)) return;
    await api.delete(`/executions${status ? `?status=${status}` : ""}`);
    await load();
  }

  async function purgeOld(days: number) {
    if (!confirm(`Delete all executions older than ${days} days?`)) return;
    await api.delete(`/executions?olderThanDays=${days}`);
    await load();
  }

  // Apply date range filter client-side
  const visibleExecutions = executions.filter((e) => {
    if (dateFrom && new Date(e.startedAt) < new Date(dateFrom)) return false;
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1); // inclusive end
      if (new Date(e.startedAt) >= to) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#060A14] text-white">
      {detail && <ExecutionDetailPanel execution={detail} onClose={() => setDetail(null)} onNoteUpdate={(note) => setDetail((d) => d ? { ...d, data: { ...(d.data ?? {}), note } } : d)} />}

      <header className="border-b border-[#1e2d4a] bg-[#0E1524] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-gray-400 hover:text-white text-sm transition-colors">← Dashboard</Link>
          <h1 className="text-xl font-bold">Executions</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {["", "SUCCESS", "FAILED", "RUNNING", "PENDING"].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); load(s, workflowFilter); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === s
                  ? "bg-[#3B6FFF] text-white"
                  : "bg-[#0E1524] border border-[#1e2d4a] text-gray-300 hover:border-[#3B6FFF]"
              }`}
            >
              {s || "All"}
            </button>
          ))}
          <input
            className="bg-[#0E1524] border border-[#1e2d4a] text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#3B6FFF] w-44"
            placeholder="Workflow ID…"
            value={workflowFilter}
            onChange={(e) => { setWorkflowFilter(e.target.value); load(statusFilter, e.target.value); }}
          />
          <button onClick={() => load()} className="bg-[#0E1524] border border-[#1e2d4a] hover:border-[#3B6FFF] text-gray-300 rounded-lg px-3 py-1.5 text-sm transition">
            Refresh
          </button>
          <button
            onClick={() => setAutoRefresh((a) => !a)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${autoRefresh ? "bg-green-700 text-white" : "bg-[#0E1524] border border-[#1e2d4a] text-gray-300"}`}
            title="Auto-refresh every 5 seconds"
          >
            {autoRefresh ? "⟳ Live" : "⟳ Off"}
          </button>
          <div className="relative group">
            <button className="bg-red-950/40 border border-red-900/40 text-red-400 rounded-lg px-3 py-1.5 text-sm transition">
              Purge ▾
            </button>
            <div className="hidden group-hover:flex absolute right-0 top-9 z-50 flex-col bg-[#0E1524] border border-[#1e2d4a] rounded-xl py-1 shadow-2xl min-w-[180px]">
              <button onClick={() => bulkDelete("FAILED")} className="px-4 py-2 text-sm text-red-400 hover:bg-[#111d32] text-left">Delete all FAILED</button>
              <button onClick={() => bulkDelete("SUCCESS")} className="px-4 py-2 text-sm text-gray-300 hover:bg-[#111d32] text-left">Delete all SUCCESS</button>
              <hr className="border-[#1e2d4a] my-1" />
              <button onClick={() => purgeOld(7)} className="px-4 py-2 text-sm text-gray-300 hover:bg-[#111d32] text-left">Purge older than 7 days</button>
              <button onClick={() => purgeOld(30)} className="px-4 py-2 text-sm text-gray-300 hover:bg-[#111d32] text-left">Purge older than 30 days</button>
            </div>
          </div>
        </div>
      </header>

      {/* Date range filter bar */}
      <div className="px-8 pt-4 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500">Date range:</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="bg-[#0E1524] border border-[#1e2d4a] text-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#3B6FFF]"
        />
        <span className="text-gray-600 text-xs">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="bg-[#0E1524] border border-[#1e2d4a] text-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#3B6FFF]"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            Clear dates
          </button>
        )}
        <span className="ml-auto text-xs text-gray-600">
          {visibleExecutions.length} result{visibleExecutions.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="px-8 py-4">
        {loading ? (
          <div className="space-y-2 mt-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 bg-[#0E1524] border border-[#1e2d4a] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : visibleExecutions.length === 0 ? (
          <div className="mt-12 text-center py-16 bg-[#0E1524] border border-[#1e2d4a] rounded-xl">
            <p className="text-gray-400 text-lg mb-2">No executions found</p>
            <p className="text-gray-600 text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#1e2d4a] mt-2">
            <table className="w-full text-sm">
              <thead className="bg-[#0E1524] text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Workflow</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Started</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                  <th className="px-4 py-3 text-left">Triggered By</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleExecutions.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t border-[#1e2d4a] cursor-pointer hover:bg-[#111d32] transition-colors bg-[#060A14]"
                    onClick={() => navigate(`/executions/${e.id}`)}
                  >
                    <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      {e.workflow ? (
                        <Link to={`/workflow/${e.workflowId}`} className="text-[#3B6FFF] hover:underline font-medium">
                          {e.workflow.name}
                        </Link>
                      ) : (
                        <span className="text-gray-500 font-mono text-xs">{e.workflowId.slice(0, 12)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={e.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      <TimeAgo date={e.startedAt} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{ms(e.startedAt, e.finishedAt)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {(e as ExecutionRow & { data?: { _trigger?: string } }).data?._trigger ?? "manual"}
                    </td>
                    <td className="px-4 py-3 flex items-center gap-2" onClick={(ev) => ev.stopPropagation()}>
                      <button
                        className="text-xs text-[#3B6FFF] hover:underline"
                        onClick={() => navigate(`/executions/${e.id}`)}
                      >
                        Detail
                      </button>
                      <button
                        className="text-xs text-gray-400 hover:underline"
                        onClick={() => openDetail(e)}
                      >
                        Quick
                      </button>
                      {(e.status === "RUNNING" || e.status === "PENDING") && (
                        <button
                          className="text-xs text-orange-400 hover:underline disabled:opacity-50"
                          disabled={cancelling === e.id}
                          onClick={(ev) => cancel(e, ev)}
                        >
                          {cancelling === e.id ? "…" : "Cancel"}
                        </button>
                      )}
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
        {nextCursor && !loading && (
          <div className="flex justify-center mt-4">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-6 py-2 bg-[#0E1524] border border-[#1e2d4a] hover:border-[#3B6FFF] text-gray-300 rounded-xl text-sm transition disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load More"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
