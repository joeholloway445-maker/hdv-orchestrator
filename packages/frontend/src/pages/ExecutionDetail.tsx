import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import api from "../api/client";
import { useAuthStore } from "../store/auth";
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

interface Execution {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  workflowId: string;
  workflow?: { id?: string; name?: string; userId?: string };
  nodeLogs: NodeLog[];
  data?: {
    note?: string;
    _knollAudit?: unknown;
    [key: string]: unknown;
  };
}

function msDuration(startedAt: string, finishedAt?: string): string {
  if (!finishedAt) return "running…";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function NodeLogRow({ log }: { log: NodeLog }) {
  const [open, setOpen] = useState(false);
  const duration = log.finishedAt
    ? `${new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime()}ms`
    : "…";

  return (
    <div className="border border-[#1e2d4a] rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-[#0E1524] hover:bg-[#111d32] text-left transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <StatusChip status={log.status} />
        <span className="text-sm text-gray-200 font-medium flex-1 truncate">
          {log.nodeType}
        </span>
        <span className="text-xs text-gray-500 font-mono">
          {log.nodeId.slice(0, 8)}…
        </span>
        <span className="text-xs text-gray-500">{duration}</span>
        <span className="text-gray-600 text-xs ml-1">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="bg-[#070d1a] border-t border-[#1e2d4a] px-4 py-3 space-y-3 text-xs">
          {log.error && (
            <div>
              <p className="text-red-400 font-semibold mb-1">Error</p>
              <pre className="bg-red-950/30 border border-red-900/30 rounded-lg p-3 text-red-300 whitespace-pre-wrap break-words overflow-auto max-h-48">
                {log.error}
              </pre>
            </div>
          )}
          {log.input !== undefined && (
            <div>
              <p className="text-gray-400 font-semibold mb-1">Input</p>
              <pre className="bg-[#0a1020] border border-[#1e2d4a] rounded-lg p-3 text-gray-300 overflow-auto max-h-48 whitespace-pre-wrap">
                {JSON.stringify(log.input, null, 2)}
              </pre>
            </div>
          )}
          {log.output !== undefined && (
            <div>
              <p className="text-gray-400 font-semibold mb-1">Output</p>
              <pre className="bg-[#0a1020] border border-[#1e2d4a] rounded-lg p-3 text-green-300 overflow-auto max-h-48 whitespace-pre-wrap">
                {JSON.stringify(log.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KnollAuditSection({ audit }: { audit: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-[#0E1524] border border-yellow-900/40 rounded-xl p-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-yellow-400 font-semibold text-sm w-full text-left"
      >
        <span>🔒 KNOLL Security Audit</span>
        <span className="ml-auto text-gray-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <pre className="mt-3 bg-[#070d1a] border border-[#1e2d4a] rounded-lg p-4 text-yellow-200 text-xs overflow-auto max-h-64 whitespace-pre-wrap">
          {JSON.stringify(audit, null, 2)}
        </pre>
      )}
    </section>
  );
}

export function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  async function fetchExecution() {
    try {
      const { data } = await api.get(`/executions/${id}`);
      setExecution(data as Execution);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Failed to load execution");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchExecution();
  }, [id]);

  // Socket.IO: connect when execution is running
  useEffect(() => {
    if (!execution || execution.status !== "RUNNING") {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const baseUrl =
      (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
      "http://localhost:4000";

    const socket = io(baseUrl, { auth: { token } });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-execution", execution.id);
    });

    // Server emits 'telemetry' events for node status updates
    socket.on(
      "telemetry",
      (event: { executionId: string; nodeLog?: NodeLog; status?: string }) => {
        if (event.executionId !== execution.id) return;

        // Update a specific node log if provided
        if (event.nodeLog) {
          setExecution((prev) => {
            if (!prev) return prev;
            const exists = prev.nodeLogs.some((nl) => nl.id === event.nodeLog!.id);
            const updatedLogs = exists
              ? prev.nodeLogs.map((nl) =>
                  nl.id === event.nodeLog!.id ? { ...nl, ...event.nodeLog } : nl
                )
              : [...prev.nodeLogs, event.nodeLog!];
            return { ...prev, nodeLogs: updatedLogs };
          });
        }

        // Update execution status if finished
        if (event.status && event.status !== "RUNNING") {
          setExecution((prev) =>
            prev ? { ...prev, status: event.status! } : prev
          );
          socket.disconnect();
        }
      }
    );

    return () => {
      socket.disconnect();
    };
  }, [execution?.id, execution?.status, token]);

  async function handleRerun() {
    if (!execution) return;
    setRerunning(true);
    try {
      const { data } = await api.post(
        `/workflows/${execution.workflowId}/execute`,
        {}
      );
      const newExec = data as { executionId?: string; id?: string };
      const newId = newExec.executionId ?? newExec.id;
      if (newId) navigate(`/executions/${newId}`);
      else navigate("/executions");
    } catch {
      alert("Re-run failed. Try using the Retry option from the executions list.");
    } finally {
      setRerunning(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060A14] flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading execution…</div>
      </div>
    );
  }

  if (error || !execution) {
    return (
      <div className="min-h-screen bg-[#060A14] flex items-center justify-center p-6">
        <div className="bg-[#0E1524] border border-red-900/40 rounded-2xl p-8 text-center">
          <p className="text-red-400 mb-4">{error || "Execution not found"}</p>
          <button
            onClick={() => navigate("/executions")}
            className="text-[#3B6FFF] hover:underline text-sm"
          >
            ← Back to Executions
          </button>
        </div>
      </div>
    );
  }

  const knollAudit = execution.data?._knollAudit;

  return (
    <div className="min-h-screen bg-[#060A14] text-white">
      {/* Header */}
      <header className="border-b border-[#1e2d4a] bg-[#0E1524] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate("/executions")}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            ← Executions
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg font-bold truncate">
                {execution.workflow?.name ?? `Workflow ${execution.workflowId.slice(0, 8)}`}
              </h1>
              <StatusChip status={execution.status} />
              {execution.status === "RUNNING" && (
                <span className="text-xs text-[#3B6FFF] animate-pulse">● Live</span>
              )}
            </div>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {execution.id}
            </p>
          </div>
          <button
            onClick={handleRerun}
            disabled={rerunning || execution.status === "RUNNING"}
            className="bg-[#3B6FFF] hover:bg-[#2558e8] disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            {rerunning ? "Starting…" : "Re-run"}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Execution summary */}
        <section className="bg-[#0E1524] border border-[#1e2d4a] rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Status</p>
            <StatusChip status={execution.status} />
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Started</p>
            <TimeAgo date={execution.startedAt} className="text-gray-200 text-sm" />
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Finished</p>
            <p className="text-gray-200">
              {execution.finishedAt ? (
                <TimeAgo date={execution.finishedAt} />
              ) : (
                <span className="text-gray-500">—</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Duration</p>
            <p className="text-gray-200 font-mono">
              {msDuration(execution.startedAt, execution.finishedAt)}
            </p>
          </div>
        </section>

        {/* Node timeline */}
        <section>
          <h2 className="text-gray-300 font-semibold mb-3 flex items-center gap-2">
            Node Timeline
            <span className="text-xs text-gray-600 font-normal">
              ({execution.nodeLogs.length} nodes)
            </span>
          </h2>
          {execution.nodeLogs.length === 0 ? (
            <div className="bg-[#0E1524] border border-[#1e2d4a] rounded-xl p-10 text-center text-gray-500">
              {execution.status === "RUNNING"
                ? "Waiting for nodes to execute…"
                : "No node logs recorded."}
            </div>
          ) : (
            <div className="space-y-2">
              {execution.nodeLogs.map((log) => (
                <NodeLogRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </section>

        {/* KNOLL Audit */}
        {knollAudit && <KnollAuditSection audit={knollAudit} />}

        {/* Workflow link */}
        <div className="flex items-center gap-4 pt-2 border-t border-[#1e2d4a]">
          <Link
            to={`/workflow/${execution.workflowId}`}
            className="text-[#3B6FFF] hover:underline text-sm"
          >
            Open in Editor →
          </Link>
        </div>
      </main>
    </div>
  );
}
