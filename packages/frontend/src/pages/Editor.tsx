import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { io, type Socket } from "socket.io-client";
import api from "../api/client";
import { useAuthStore } from "../store/auth";
import { NodeSidebar } from "../components/NodeSidebar";
import { NodeConfigPanel } from "../components/NodeConfigPanel";
import { ExecutionPanel } from "../components/ExecutionPanel";
import { nodeTypes } from "../components/nodes/nodeTypes";

interface NodeData {
  label?: string;
  nodeType?: string;
  webhookId?: string;
  method?: string;
  url?: string;
  body?: string;
  credentialId?: string;
  code?: string;
  condition?: string;
  mappings?: Array<{ key: string; value: string }>;
  cases?: Array<{ value: string; output: string }>;
  field?: string;
  defaultOutput?: string;
  cronExpression?: string;
  arrayKey?: string;
  duration?: string;
  targetWorkflowId?: string;
  statusCode?: string;
  responseBody?: string;
  syncResponse?: boolean;
  [key: string]: unknown;
}

interface WorkflowRecord {
  id: string;
  name: string;
  active: boolean;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

interface ExecutionRecord {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
}

interface NodeLog {
  id: string;
  nodeId: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

type NodeStatus = "running" | "success" | "error";

export const NODE_TYPE_CONFIG = [
  // Triggers
  { type: "webhookTrigger", label: "Webhook Trigger", color: "bg-purple-700", description: "HTTP POST trigger" },
  { type: "manualTrigger", label: "Manual Trigger", color: "bg-indigo-700", description: "Run manually" },
  { type: "scheduleTrigger", label: "Schedule Trigger", color: "bg-indigo-800", description: "Cron-based schedule" },
  // HTTP & Code
  { type: "httpRequest", label: "HTTP Request", color: "bg-blue-700", description: "Calls an external URL" },
  { type: "code", label: "Code", color: "bg-orange-700", description: "Sandboxed JS" },
  { type: "email", label: "Email", color: "bg-sky-700", description: "Send SMTP email" },
  // Flow control
  { type: "ifBranch", label: "IF Branch", color: "bg-yellow-700", description: "Conditional routing" },
  { type: "switch", label: "Switch", color: "bg-amber-700", description: "Multi-way routing" },
  { type: "merge", label: "Merge", color: "bg-pink-700", description: "Combine branches" },
  { type: "respond", label: "Respond", color: "bg-rose-700", description: "Webhook response" },
  // Data
  { type: "set", label: "Set Fields", color: "bg-teal-700", description: "Map/transform fields" },
  { type: "filter", label: "Filter", color: "bg-emerald-700", description: "Filter array items" },
  { type: "loop", label: "Loop", color: "bg-violet-700", description: "Iterate over array" },
  { type: "wait", label: "Wait", color: "bg-slate-600", description: "Delay execution" },
  // Workflows & Memory
  { type: "subWorkflow", label: "Sub-workflow", color: "bg-fuchsia-700", description: "Call another workflow" },
  { type: "memoryRead", label: "Memory Read", color: "bg-cyan-700", description: "Read user memory" },
  { type: "memoryWrite", label: "Memory Write", color: "bg-cyan-800", description: "Write user memory" },
];

function nodeStyle(status: NodeStatus | undefined): React.CSSProperties {
  if (!status) return {};
  const ring: Record<NodeStatus, string> = {
    running: "0 0 0 3px #facc15",
    success: "0 0 0 3px #4ade80",
    error: "0 0 0 3px #f87171",
  };
  return { boxShadow: ring[status] };
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);

  const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<Array<{ id: string; name: string; createdAt: string }>>([]);
  const [nodeLogs, setNodeLogs] = useState<NodeLog[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // Undo/redo history
  const historyRef = useRef<Array<{ nodes: Node<NodeData>[]; edges: Edge[] }>>([]);
  const historyIdxRef = useRef(-1);
  const skipHistoryRef = useRef(false);

  function pushHistory(ns: Node<NodeData>[], es: Edge[]) {
    if (skipHistoryRef.current) return;
    const stack = historyRef.current.slice(0, historyIdxRef.current + 1);
    stack.push({ nodes: ns, edges: es });
    historyRef.current = stack.slice(-50);
    historyIdxRef.current = historyRef.current.length - 1;
  }

  function undo() {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const snap = historyRef.current[historyIdxRef.current];
    skipHistoryRef.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    skipHistoryRef.current = false;
  }

  function redo() {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const snap = historyRef.current[historyIdxRef.current];
    skipHistoryRef.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    skipHistoryRef.current = false;
  }

  // Push history on structural changes
  const prevNodesRef = useRef<Node<NodeData>[]>([]);
  const prevEdgesRef = useRef<Edge[]>([]);

  useEffect(() => {
    const nodesChanged = nodes !== prevNodesRef.current;
    const edgesChanged = edges !== prevEdgesRef.current;
    if ((nodesChanged || edgesChanged) && !skipHistoryRef.current) {
      pushHistory(nodes, edges);
      prevNodesRef.current = nodes;
      prevEdgesRef.current = edges;
    }
  }, [nodes, edges]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    api.get(`/workflows/${id}`).then(({ data }) => {
      const wf = data as WorkflowRecord;
      setWorkflow(wf);
      setNodes((wf.nodes as Node<NodeData>[]) || []);
      setEdges((wf.edges as Edge[]) || []);
    });
    api.get(`/executions/workflow/${id}`).then(({ data }) => {
      setExecutions(data as ExecutionRecord[]);
    });
  }, [id]);

  useEffect(() => {
    const socket = io("http://localhost:4000", { auth: { token } });
    socketRef.current = socket;

    socket.on("telemetry", (event: { type: string; nodeId?: string; executionId: string }) => {
      if (event.type === "node-started" && event.nodeId) {
        setNodeStatuses((prev) => ({ ...prev, [event.nodeId!]: "running" }));
      } else if (event.type === "node-finished" && event.nodeId) {
        setNodeStatuses((prev) => ({ ...prev, [event.nodeId!]: "success" }));
      } else if (event.type === "node-error" && event.nodeId) {
        setNodeStatuses((prev) => ({ ...prev, [event.nodeId!]: "error" }));
      } else if (event.type === "execution-failed") {
        setExecuting(false);
        refreshExecutions();
      }
    });

    return () => { socket.disconnect(); };
  }, [token]);

  useEffect(() => {
    if (executionId) {
      socketRef.current?.emit("join-execution", executionId);
    }
  }, [executionId]);

  function refreshExecutions() {
    api.get(`/executions/workflow/${id}`).then(({ data }) => setExecutions(data as ExecutionRecord[]));
  }

  async function retryExecution(execId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const { data } = await api.post(`/executions/${execId}/retry`);
    const fresh = data as ExecutionRecord;
    setExecutions((prev) => [fresh, ...prev]);
  }

  async function loadExecutionLogs(execId: string) {
    const { data } = await api.get(`/executions/${execId}`);
    const exec = data as { nodeLogs: NodeLog[] };
    setNodeLogs(exec.nodeLogs || []);
  }

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/reactflow");
      if (!type || !rfInstance || !wrapperRef.current) return;

      const bounds = wrapperRef.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });

      const config = NODE_TYPE_CONFIG.find((n) => n.type === type);
      const newNode: Node<NodeData> = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label: config?.label || type, nodeType: type },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [rfInstance, setNodes]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  async function save() {
    setSaving(true);
    await api.put(`/workflows/${id}`, { nodes, edges, name: workflow?.name, active: workflow?.active });
    setSaving(false);
  }

  async function execute() {
    await save();
    setNodeStatuses({});
    setNodeLogs([]);
    setExecuting(true);
    setExecutionId(null);
    const { data } = await api.post(`/workflows/${id}/execute`);
    const execId = (data as { id: string }).id;
    setExecutionId(execId);
    setExecutions((prev) => [
      { id: execId, status: "RUNNING", startedAt: new Date().toISOString() },
      ...prev,
    ]);
    // Poll for completion to refresh history
    const poll = setInterval(async () => {
      const { data: ex } = await api.get(`/executions/${execId}`);
      const rec = ex as ExecutionRecord & { nodeLogs: NodeLog[] };
      if (rec.status !== "RUNNING" && rec.status !== "PENDING") {
        clearInterval(poll);
        setExecuting(false);
        setNodeLogs(rec.nodeLogs || []);
        refreshExecutions();
      }
    }, 1000);
  }

  async function loadVersions() {
    const { data } = await api.get(`/workflows/${id}/versions`);
    setVersions(data as Array<{ id: string; name: string; createdAt: string }>);
  }

  async function snapshotWorkflow() {
    await save();
    const label = `Snapshot ${new Date().toLocaleString()}`;
    await api.post(`/workflows/${id}/versions`, { name: label });
    await loadVersions();
  }

  async function restoreVersion(versionId: string) {
    if (!confirm("Restore this snapshot? Current unsaved changes will be lost.")) return;
    const { data } = await api.post(`/workflows/${id}/versions/${versionId}/restore`);
    const wf = data as WorkflowRecord;
    setNodes((wf.nodes as Node<NodeData>[]) || []);
    setEdges((wf.edges as Edge[]) || []);
  }

  function exportWorkflow() {
    const blob = new Blob([JSON.stringify({ nodes, edges, name: workflow?.name }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflow?.name || "workflow"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importWorkflow() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const parsed = JSON.parse(text) as { nodes: Node<NodeData>[]; edges: Edge[]; name?: string };
      setNodes(parsed.nodes || []);
      setEdges(parsed.edges || []);
      if (parsed.name && workflow) setWorkflow({ ...workflow, name: parsed.name });
    };
    input.click();
  }

  function updateNodeData(nodeId: string, newData: Partial<NodeData>) {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n))
    );
    setSelectedNode((prev) =>
      prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...newData } } : prev
    );
  }

  const selectedNodeLog = selectedNode
    ? nodeLogs.find((l) => l.nodeId === selectedNode.id) ?? null
    : null;

  const displayNodes = nodes.map((n) => ({
    ...n,
    style: { ...n.style, ...nodeStyle(nodeStatuses[n.id]) },
  }));

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white text-sm transition">
          ← Back
        </button>
        <input
          className="bg-transparent text-white font-semibold text-lg focus:outline-none border-b border-transparent hover:border-gray-600 focus:border-blue-500 px-1 min-w-0 flex-1"
          value={workflow?.name || ""}
          onChange={(e) => setWorkflow((w) => (w ? { ...w, name: e.target.value } : w))}
        />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            onClick={importWorkflow}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition"
          >
            Import
          </button>
          <button
            onClick={exportWorkflow}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition"
          >
            Export
          </button>
          <button
            onClick={() => setShowHistory((h) => !h)}
            className={`px-3 py-1.5 rounded-lg text-xs transition ${showHistory ? "bg-gray-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
          >
            History
          </button>
          <button
            onClick={() => { setShowVersions((v) => { const next = !v; if (next) loadVersions(); return next; }); }}
            className={`px-3 py-1.5 rounded-lg text-xs transition ${showVersions ? "bg-gray-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
          >
            Versions
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={workflow?.active || false}
              onChange={(e) => setWorkflow((w) => (w ? { ...w, active: e.target.checked } : w))}
              className="accent-green-500"
            />
            Active
          </label>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={execute}
            disabled={executing}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
          >
            {executing ? "Running…" : "▶ Execute"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <NodeSidebar nodeTypes={NODE_TYPE_CONFIG} />

        <div className="flex-1 relative" ref={wrapperRef}>
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRfInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={(_, node) => setSelectedNode(node as Node<NodeData>)}
            onPaneClick={() => setSelectedNode(null)}
            fitView
            deleteKeyCode="Delete"
          >
            <Background color="#374151" gap={16} />
            <Controls />
            <MiniMap bgColor="#111827" nodeColor="#1f2937" maskColor="#111827aa" />
          </ReactFlow>
        </div>

        {showHistory && (
          <aside className="w-64 bg-gray-800 border-l border-gray-700 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-white text-sm font-semibold">Execution History</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-white text-lg">×</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {executions.length === 0 ? (
                <p className="text-gray-600 text-xs p-4">No executions yet</p>
              ) : (
                executions.map((ex) => (
                  <div
                    key={ex.id}
                    onClick={() => loadExecutionLogs(ex.id)}
                    className="w-full text-left px-4 py-3 border-b border-gray-700 hover:bg-gray-700/50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          ex.status === "SUCCESS"
                            ? "bg-green-400"
                            : ex.status === "FAILED"
                              ? "bg-red-400"
                              : ex.status === "RUNNING"
                                ? "bg-yellow-400 animate-pulse"
                                : "bg-gray-500"
                        }`}
                      />
                      <span className="text-xs text-gray-300 capitalize flex-1">{ex.status.toLowerCase()}</span>
                      {(ex.status === "FAILED" || ex.status === "SUCCESS") && (
                        <button
                          onClick={(e) => retryExecution(ex.id, e)}
                          className="text-gray-500 hover:text-blue-400 text-xs px-1 transition"
                          title="Retry"
                        >
                          ↺
                        </button>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs mt-1">
                      {new Date(ex.startedAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {showVersions && (
          <aside className="w-64 bg-gray-800 border-l border-gray-700 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-white text-sm font-semibold">Versions</h3>
              <div className="flex items-center gap-2">
                <button onClick={snapshotWorkflow} className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition" title="Save snapshot">
                  + Snapshot
                </button>
                <button onClick={() => setShowVersions(false)} className="text-gray-500 hover:text-white text-lg">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {versions.length === 0 ? (
                <p className="text-gray-600 text-xs p-4">No snapshots yet. Click &ldquo;+ Snapshot&rdquo; to save the current state.</p>
              ) : (
                versions.map((v) => (
                  <div key={v.id} className="px-4 py-3 border-b border-gray-700 hover:bg-gray-700/50 transition">
                    <p className="text-xs text-gray-300 font-medium truncate">{v.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{new Date(v.createdAt).toLocaleString()}</p>
                    <button
                      onClick={() => restoreVersion(v.id)}
                      className="mt-1.5 text-xs text-blue-400 hover:text-blue-300 transition"
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={(data) => updateNodeData(selectedNode.id, data)}
            onClose={() => setSelectedNode(null)}
            nodeLog={selectedNodeLog}
          />
        )}
      </div>

      <ExecutionPanel nodeStatuses={nodeStatuses} executionId={executionId} />
    </div>
  );
}
