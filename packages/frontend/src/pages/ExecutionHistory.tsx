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
  data?: { note?: string; [key: string]: unknown };
}

interface ExecutionWithLogs extends ExecutionRow {
  nodeLogs: NodeLog[];
}

function duration(startedAt: string, finishedAt?: string): string {
  if (!finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function NodeLogRow({ log }: { log: NodeLog }) {
  const [open, setOpen] = useState(false);
  const STATUS_COLORS: Record<string, string> = {
    SUCCESS: "bg-green-900 text-green-300",
    FAILED: "bg-red-900 text-red-300",
    ERROR: "bg-red-900 text-red-300",
    RUNNING: "bg-blue-900 text-blue-300",
    PENDING: "bg-yellow-900 text-yellow-300",
  };
  return (
    <div className="border border-[#1e2d4a] rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-3 py-2 bg-[#0E1524] hover:bg-[#111d32] text-left transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={`px-1.5 py-0.5 rounded text-xs font-bold ${
            STATUS_COLORS[log.status] ?? "bg-gray-700 text-gray-300"
          }`}
        >
          {log.status}
        </span>
        <span className="text-xs text-gray-300 font-mono flex-1 truncate">
          {log.nodeType}{" "}
          <span className="text-gray-600">({log.nodeId.slice(0, 10)}…)</span>
        </span>
        <span className="text-xs text-gray-500">
          {duration(log.startedAt, log.finishedAt)}
        </span>
        <span className="text-gray-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="bg-[#070d1a] px-3 py-2 space-y-2 text-xs border-t border-[#1e2d4a]">
          {log.error && (
            <div>
              <p className="text-red-400 font-semibold mb-1">Error</p>
              <pre className="bg-red-950/30 border border-red-900/30 rounded-lg p-2 text-red-300 whitespace-pre-wrap break-words overflow-auto max-h-36">
                {log.error}
              </pre>
            </div>
          )}
          {log.input !== undefined && (
            <div>
              <p className="text-gray-400 font-semibold mb-1">Input</p>
              <pre className="bg-[#0a1020] border border-[#1e2d4a] rounded-lg p-2 text-gray-300 overflow-auto max-h-36 whitespace-pre-wrap">
                {JSON.stringify(log.input, null, 2)}
              </pre>
            </div>
          )}
          {log.output !== undefined && (
            <div>
              <p className="text-gray-400 font-semibold mb-1">Output</p>
              <pre className="bg-[#0a1020] border border-[#1e2d4a] rounded-lg p-2 text-green-300 overflow-auto max-h-36 whitespace-pre-wrap">
                {JSON.stringify(log.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExpandedLogs({
  execution,
}: {
  execution: ExecutionRow;
}) {
  const [detail, setDetail] = useState<ExecutionWithLogs | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/executions/${execution.id}`)
      .then(({ data }) => {
        const d = data as ExecutionWithLogs;
        setDetail(d);
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [execution.id]);

  if (loading) {
    return (
      <td
        colSpan={6}
        className="px-6 py-4 bg-[#070d1a] border-t border-[#1e2d4a]"
      >
        <p className="text-gray-500 text-xs animate-pulse">Loading logs…</p>
      </td>
    );
  }

  if (!detail) {
    return (
      <td
        colSpan={6}
        className="px-6 py-4 bg-[#070d1a] border-t border-[#1e2d4a]"
      >
        <p className="text-red-400 text-xs">Failed to load logs.</p>
      </td>
    );
  }

  return (
    <td
      colSpan={6}
      className="px-6 py-4 bg-[#070d1a] border-t border-[#1e2d4a]"
    >
      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
        {detail.nodeLogs.length === 0 ? (
          <p className="text-gray-600 text-xs">No node logs recorded.</p>
        ) : (
          detail.nodeLogs.map((log) => (
            <NodeLogRow key={log.id} log={log} />
          ))
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Link
          to={`/executions/${execution.id}`}
          className="text-xs text-[#3B6FFF] hover:underline"
        >
          Open full detail →
        </Link>
        {execution.workflow && (
          <Link
            to={`/workflow/${execution.workflowId}`}
            className="text-xs text-gray-400 hover:underline"
          >
            Open in Editor →
          </Link>
        )}
      </div>
    </td>
  );
}

const STATUS_FILTERS = ["", "SUCCESS", "FAILED", "RUNNING", "PENDING"] as const;

export function ExecutionHistoryPage() {
  const navigate = useNavigate();
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function buildParams(extra?: Record<string, string>) {
    const p = new URLSearchParams({ limit: "50" });
    if (statusFilter) p.set("status", statusFilter);
    if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p.toString();
  }

  async function load(sf = statusFilter) {
    setLoading(true);
    setExpandedId(null);
    try {
      const p = new URLSearchParams({ limit: "50" });
      if (sf) p.set("status", sf);
      const { data } = await api.get(`/executions?${p.toString()}`);
      const payload = data as
        | { items?: ExecutionRow[]; nextCursor?: string | null }
        | ExecutionRow[];
      const list = Array.isArray(payload)
        ? payload
        : (payload.items ?? []);
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
      const { data } = await api.get(
        `/executions?${buildParams({ cursor: nextCursor })}`
      );
      const payload = data as
        | { items?: ExecutionRow[]; nextCursor?: string | null }
        | ExecutionRow[];
      const list = Array.isArray(payload) ? payload : (payload.items ?? []);
      const cursor = Array.isArray(payload) ? null : (payload.nextCursor ?? null);
      setExecutions((prev) => [...prev, ...(list as ExecutionRow[])]);
      setNextCursor(cursor);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="min-h-screen bg-[#060A14] text-white">
      {/* Header */}
      <header className="border-b border-[#1e2d4a] bg-[#0E1524] px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold">Execution History</h1>
          <span className="text-xs text-gray-500 hidden sm:block">
            All past runs across all workflows
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                load(s);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === s
                  ? "bg-[#3B6FFF] text-white"
                  : "bg-[#0E1524] border border-[#1e2d4a] text-gray-300 hover:border-[#3B6FFF]"
              }`}
            >
              {s || "All"}
            </button>
          ))}
          <button
            onClick={() => load()}
            className="bg-[#0E1524] border border-[#1e2d4a] hover:border-[#3B6FFF] text-gray-300 rounded-lg px-3 py-1.5 text-sm transition"
          >
            Refresh
          </button>
          <Link
            to="/executions"
            className="bg-[#0E1524] border border-[#1e2d4a] hover:border-[#3B6FFF] text-gray-300 rounded-lg px-3 py-1.5 text-sm transition"
          >
            Full Executions View
          </Link>
        </div>
      </header>

      {/* Body */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="h-12 bg-[#0E1524] border border-[#1e2d4a] rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : executions.length === 0 ? (
          <div className="mt-12 text-center py-20 bg-[#0E1524] border border-[#1e2d4a] rounded-xl">
            <p className="text-gray-400 text-lg mb-2">No executions found</p>
            <p className="text-gray-600 text-sm">
              {statusFilter
                ? `No ${statusFilter} executions. Try a different filter.`
                : "Run a workflow to see its history here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#1e2d4a]">
            <table className="w-full text-sm">
              <thead className="bg-[#0E1524] text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Workflow</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Started</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                  <th className="px-4 py-3 text-left">Error / Note</th>
                  <th className="px-4 py-3 text-left">Logs</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((e) => {
                  const isExpanded = expandedId === e.id;
                  const errorMsg =
                    e.status === "FAILED"
                      ? (e.data as { error?: string } | undefined)?.error
                      : undefined;
                  const note = e.data?.note;
                  return (
                    <>
                      <tr
                        key={e.id}
                        className={`border-t border-[#1e2d4a] hover:bg-[#111d32] transition-colors cursor-pointer ${
                          isExpanded ? "bg-[#111d32]" : "bg-[#060A14]"
                        }`}
                        onClick={() => toggleExpand(e.id)}
                      >
                        <td
                          className="px-4 py-3"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          {e.workflow ? (
                            <Link
                              to={`/workflow/${e.workflowId}`}
                              className="text-[#3B6FFF] hover:underline font-medium"
                            >
                              {e.workflow.name}
                            </Link>
                          ) : (
                            <span className="text-gray-500 font-mono text-xs">
                              {e.workflowId.slice(0, 12)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusChip status={e.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          <TimeAgo date={e.startedAt} />
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                          {duration(e.startedAt, e.finishedAt)}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-xs">
                          {errorMsg ? (
                            <span
                              className="text-red-400 line-clamp-1"
                              title={errorMsg}
                            >
                              {errorMsg.length > 60
                                ? `${errorMsg.slice(0, 60)}…`
                                : errorMsg}
                            </span>
                          ) : note ? (
                            <span className="text-gray-500 italic line-clamp-1">
                              {note}
                            </span>
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button
                              className="text-xs text-gray-400 hover:text-white transition-colors"
                              onClick={() => toggleExpand(e.id)}
                            >
                              {isExpanded ? "▲ Collapse" : "▼ Expand"}
                            </button>
                            <button
                              className="text-xs text-[#3B6FFF] hover:underline"
                              onClick={() => navigate(`/executions/${e.id}`)}
                            >
                              Detail
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr
                          key={`${e.id}-logs`}
                          className="bg-[#070d1a]"
                        >
                          <ExpandedLogs execution={e} />
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {nextCursor && !loading && (
          <div className="flex justify-center mt-6">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-6 py-2 bg-[#0E1524] border border-[#1e2d4a] hover:border-[#3B6FFF] text-gray-300 rounded-xl text-sm transition disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load More"}
            </button>
          </div>
        )}

        {!loading && executions.length > 0 && (
          <p className="text-center text-xs text-gray-700 mt-4">
            {executions.length} execution{executions.length !== 1 ? "s" : ""} loaded
            {statusFilter ? ` · filtered by ${statusFilter}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
