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
import {
  StudioNodePanel,
  isStudioNodeType,
} from "../components/nodes/NodeConfigPanel";
import { ExecutionPanel } from "../components/ExecutionPanel";
import { DreamGenerator } from "../components/DreamGenerator";
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
  description?: string;
  tags?: string[];
  errorWorkflowId?: string;
  timeoutMs?: number | null;
  maxConcurrency?: number | null;
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

type NodeStatus = "running" | "success" | "error" | "skipped";

export const NODE_TYPE_CONFIG = [
  // Triggers
  { type: "webhookTrigger", label: "Webhook Trigger", color: "bg-purple-700", description: "HTTP POST trigger", category: "Triggers" },
  { type: "manualTrigger", label: "Manual Trigger", color: "bg-indigo-700", description: "Run manually", category: "Triggers" },
  { type: "scheduleTrigger", label: "Schedule Trigger", color: "bg-indigo-800", description: "Cron-based schedule", category: "Triggers" },
  // Core
  { type: "httpRequest", label: "HTTP Request", color: "bg-blue-700", description: "Calls an external URL", category: "Core" },
  { type: "code", label: "Code", color: "bg-orange-700", description: "Sandboxed JS", category: "Core" },
  { type: "email", label: "Email", color: "bg-sky-700", description: "Send SMTP email", category: "Core" },
  { type: "slack", label: "Slack", color: "bg-purple-600", description: "Send Slack message via webhook", category: "Core" },
  { type: "database", label: "Database", color: "bg-green-900", description: "Query Postgres or MySQL", category: "Core" },
  { type: "respond", label: "Respond", color: "bg-rose-700", description: "Webhook response", category: "Core" },
  // Flow
  { type: "ifBranch", label: "IF Branch", color: "bg-yellow-700", description: "Conditional routing", category: "Flow" },
  { type: "switch", label: "Switch", color: "bg-amber-700", description: "Multi-way routing", category: "Flow" },
  { type: "merge", label: "Merge", color: "bg-pink-700", description: "Combine branches", category: "Flow" },
  { type: "loop", label: "Loop", color: "bg-violet-700", description: "Iterate over array", category: "Flow" },
  { type: "splitBatches", label: "Split in Batches", color: "bg-orange-600", description: "Process array in chunks", category: "Flow" },
  { type: "wait", label: "Wait", color: "bg-slate-600", description: "Delay execution", category: "Flow" },
  // Data
  { type: "set", label: "Set Fields", color: "bg-teal-700", description: "Map/transform fields", category: "Data" },
  { type: "filter", label: "Filter", color: "bg-emerald-700", description: "Filter array items", category: "Data" },
  { type: "aggregate", label: "Aggregate", color: "bg-lime-700", description: "Collect items into array", category: "Data" },
  { type: "transform", label: "Transform", color: "bg-teal-600", description: "Reshape JSON output", category: "Data" },
  { type: "datetime", label: "Date & Time", color: "bg-sky-600", description: "Format, add, diff dates", category: "Data" },
  { type: "crypto", label: "Crypto / Hash", color: "bg-gray-700", description: "Hash, HMAC, Base64, UUID", category: "Data" },
  // AI & Memory
  { type: "ai", label: "AI / LLM", color: "bg-purple-900", description: "Call Claude / Anthropic", category: "AI" },
  { type: "memoryRead", label: "Memory Read", color: "bg-cyan-700", description: "Read user memory", category: "AI" },
  { type: "memoryWrite", label: "Memory Write", color: "bg-cyan-800", description: "Write user memory", category: "AI" },
  // HDV Big Five
  { type: "knoll", label: "KNOLL", color: "bg-red-800", description: "Security sentinel — blocks forbidden keys, SSRF, oversized payloads", category: "HDV" },
  { type: "apex", label: "APEX", color: "bg-purple-700", description: "MoE router — routes tasks to optimal Claude model", category: "HDV" },
  { type: "dream", label: "DREAM", color: "bg-indigo-800", description: "Simulation & creation — simulate, score, or generate workflows", category: "HDV" },
  { type: "vision", label: "VISION", color: "bg-cyan-800", description: "Automation runtime — trigger or execute sub-workflows", category: "HDV" },
  { type: "hope", label: "HOPE", color: "bg-green-800", description: "Auth gateway — validates user JWT and enriches context", category: "HDV" },
  // Workflows
  { type: "subWorkflow", label: "Sub-workflow", color: "bg-fuchsia-700", description: "Call another workflow", category: "Workflows" },
  // Utilities
  { type: "validate", label: "Validate", color: "bg-red-700", description: "Validate field rules", category: "Utilities" },
  { type: "noOp", label: "No Op", color: "bg-gray-500", description: "Pass-through — does nothing", category: "Utilities" },
  { type: "stopError", label: "Stop & Error", color: "bg-red-900", description: "Halt execution with error", category: "Utilities" },
  { type: "jsonPath", label: "JSON Path", color: "bg-indigo-600", description: "Get, set, pick, omit, rename fields", category: "Data" },
  { type: "csv", label: "CSV", color: "bg-green-700", description: "Parse or stringify CSV", category: "Data" },
  { type: "htmlExtract", label: "HTML Extract", color: "bg-orange-800", description: "Extract data from HTML", category: "Data" },
  { type: "xml", label: "XML", color: "bg-lime-700", description: "Parse or stringify XML", category: "Data" },
  { type: "rss", label: "RSS / Atom", color: "bg-orange-600", description: "Fetch and parse RSS/Atom feed", category: "Data" },
  { type: "deduplicate", label: "Deduplicate", color: "bg-teal-700", description: "Remove duplicate items from an array", category: "Data" },
  { type: "sort", label: "Sort", color: "bg-cyan-700", description: "Sort array items by a field or value", category: "Data" },
  { type: "limit", label: "Limit", color: "bg-indigo-700", description: "Cap array to a maximum number of items", category: "Data" },
  { type: "renameKeys", label: "Rename Keys", color: "bg-violet-700", description: "Rename or move fields using dot-path mappings", category: "Data" },
  { type: "stickyNote", label: "Sticky Note", color: "bg-yellow-500", description: "Canvas annotation", category: "Utilities" },
];

function nodeStyle(status: NodeStatus | undefined): React.CSSProperties {
  if (!status) return {};
  const ring: Record<NodeStatus, string> = {
    running: "0 0 0 3px #facc15",
    success: "0 0 0 3px #4ade80",
    error: "0 0 0 3px #f87171",
    skipped: "0 0 0 3px #6b7280",
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
  const [nodeOutputs, setNodeOutputs] = useState<Record<string, unknown>>({});
  const [nodeErrors, setNodeErrors] = useState<Record<string, string>>({});
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [allWorkflows, setAllWorkflows] = useState<{ id: string; name: string }[]>([]);
  const [versions, setVersions] = useState<Array<{ id: string; name: string; createdAt: string }>>([]);
  const [nodeLogs, setNodeLogs] = useState<NodeLog[]>([]);
  const [quickAdd, setQuickAdd] = useState<{ x: number; y: number; flowPos: { x: number; y: number } } | null>(null);
  const [quickAddSearch, setQuickAddSearch] = useState("");
  const [stats, setStats] = useState<{ total: number; successRate: number | null; avgDurationMs: number | null } | null>(null);
  const [showDreamGenerator, setShowDreamGenerator] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [showSimulatePanel, setShowSimulatePanel] = useState(false);
  const [simulateResult, setSimulateResult] = useState<{
    trace: Array<{ nodeId: string; nodeType: string; simulated: boolean; output: Record<string, unknown> }>;
    score: { score: number; grade: string; hasKnoll: boolean; hasApex: boolean; hasErrorHandling: boolean; hasOutputNode: boolean; recommendations: (string | null)[] };
    summary: { totalNodes: number; simulatedNodes: number; realNodes: number };
  } | null>(null);

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

  function duplicateSelected() {
    if (!selectedNode) return;
    const newNode: Node<NodeData> = {
      ...selectedNode,
      id: `${selectedNode.type}-${Date.now()}`,
      position: { x: selectedNode.position.x + 40, y: selectedNode.position.y + 40 },
      selected: false,
      data: { ...selectedNode.data },
    };
    setNodes((nds) => nds.concat(newNode));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") { e.preventDefault(); duplicateSelected(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNode]);

  useEffect(() => {
    api.get(`/workflows/${id}`).then(({ data }) => {
      const wf = data as WorkflowRecord;
      setWorkflow(wf);
      setNodes((wf.nodes as Node<NodeData>[]) || []);
      setEdges((wf.edges as Edge[]) || []);
    });
    api.get(`/executions/workflow/${id}`).then(async ({ data }) => {
      const execs: ExecutionRecord[] = Array.isArray(data) ? data : ((data as { items?: ExecutionRecord[] }).items ?? []);
      setExecutions(execs);
      // Load node logs from most recent finished execution for output overlays
      const lastFinished = execs.find((e) => e.status === "SUCCESS" || e.status === "FAILED");
      if (lastFinished) {
        const { data: detail } = await api.get(`/executions/${lastFinished.id}`);
        setNodeLogs((detail as { nodeLogs: NodeLog[] }).nodeLogs || []);
        const statuses: Record<string, NodeStatus> = {};
        for (const log of (detail as { nodeLogs: NodeLog[] }).nodeLogs) {
          statuses[log.nodeId] = log.status.toLowerCase() as NodeStatus;
        }
        setNodeStatuses(statuses);
      }
    });
    api.get("/workflows").then(({ data }) => {
      const list = Array.isArray(data) ? data : ((data as { items?: WorkflowRecord[] }).items ?? []);
      setAllWorkflows(list.map((w: WorkflowRecord) => ({ id: w.id, name: w.name })));
    });
    api.get(`/workflows/${id}/stats`).then(({ data }) => {
      setStats(data as { total: number; successRate: number | null; avgDurationMs: number | null });
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
    const socket = io(wsUrl, { auth: { token } });
    socketRef.current = socket;

    socket.on("telemetry", (event: { type: string; nodeId?: string; executionId: string; output?: unknown; error?: string }) => {
      if (event.type === "node-started" && event.nodeId) {
        setNodeStatuses((prev) => ({ ...prev, [event.nodeId!]: "running" }));
      } else if (event.type === "node-finished" && event.nodeId) {
        setNodeStatuses((prev) => ({ ...prev, [event.nodeId!]: "success" }));
        if (event.output !== undefined) setNodeOutputs((prev) => ({ ...prev, [event.nodeId!]: event.output }));
      } else if (event.type === "node-error" && event.nodeId) {
        setNodeStatuses((prev) => ({ ...prev, [event.nodeId!]: "error" }));
        if (event.error) setNodeErrors((prev) => ({ ...prev, [event.nodeId!]: event.error! }));
      } else if (event.type === "node-skipped" && event.nodeId) {
        setNodeStatuses((prev) => ({ ...prev, [event.nodeId!]: "skipped" }));
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
    api.get(`/executions/workflow/${id}`).then(({ data }) => {
      const execs: ExecutionRecord[] = Array.isArray(data) ? data : ((data as { items?: ExecutionRecord[] }).items ?? []);
      setExecutions(execs);
    });
  }

  async function retryExecution(execId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const { data } = await api.post(`/executions/${execId}/retry`);
    const fresh = data as ExecutionRecord;
    setExecutions((prev) => [fresh, ...prev]);
  }

  async function cancelExecution(execId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const { data } = await api.post(`/executions/${execId}/cancel`);
    const updated = data as ExecutionRecord;
    setExecutions((prev) => prev.map((ex) => ex.id === execId ? { ...ex, status: updated.status } : ex));
    if (execId === executionId) {
      setExecuting(false);
    }
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

  function onPaneDoubleClick(e: React.MouseEvent) {
    if (!rfInstance || !wrapperRef.current) return;
    const bounds = wrapperRef.current.getBoundingClientRect();
    const flowPos = rfInstance.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
    setQuickAdd({ x: e.clientX, y: e.clientY, flowPos });
    setQuickAddSearch("");
  }

  function addNodeFromQuickAdd(type: string) {
    if (!quickAdd) return;
    const config = NODE_TYPE_CONFIG.find((n) => n.type === type);
    const newNode: Node<NodeData> = {
      id: `${type}-${Date.now()}`,
      type,
      position: quickAdd.flowPos,
      data: { label: config?.label || type, nodeType: type },
    };
    setNodes((nds) => nds.concat(newNode));
    setQuickAdd(null);
  }

  async function save() {
    setSaving(true);
    await api.put(`/workflows/${id}`, { nodes, edges, name: workflow?.name, active: workflow?.active, tags: workflow?.tags ?? [], errorWorkflowId: workflow?.errorWorkflowId || null, timeoutMs: workflow?.timeoutMs ?? null, maxConcurrency: workflow?.maxConcurrency ?? null, description: workflow?.description ?? null });
    setSaving(false);
  }

  async function toggleActive() {
    if (!workflow) return;
    const { data } = await api.put(`/workflows/${id}`, { active: !workflow.active });
    setWorkflow((w) => (w ? { ...w, active: (data as WorkflowRecord).active } : w));
  }

  async function execute() {
    await save();
    setNodeStatuses({});
    setNodeOutputs({});
    setNodeErrors({});
    setNodeLogs([]);
    setExecuting(true);
    setExecutionId(null);
    // Read testData from the manual trigger node if present
    const manualNode = nodes.find((n) => (n.data?.nodeType || n.type) === "manualTrigger");
    let triggerData: Record<string, unknown> = {};
    if (manualNode?.data?.testData) {
      try { triggerData = JSON.parse(manualNode.data.testData as string); } catch { /* ignore invalid JSON */ }
    }
    const { data } = await api.post(`/workflows/${id}/execute`, { data: triggerData });
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
    const blob = new Blob([JSON.stringify({
      name: workflow?.name,
      tags: workflow?.tags ?? [],
      errorWorkflowId: workflow?.errorWorkflowId,
      timeoutMs: workflow?.timeoutMs,
      nodes,
      edges,
    }, null, 2)], {
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
      const parsed = JSON.parse(text) as { nodes: Node<NodeData>[]; edges: Edge[]; name?: string; tags?: string[]; errorWorkflowId?: string; timeoutMs?: number };
      setNodes(parsed.nodes || []);
      setEdges(parsed.edges || []);
      if (workflow) {
        setWorkflow({
          ...workflow,
          ...(parsed.name ? { name: parsed.name } : {}),
          ...(parsed.tags ? { tags: parsed.tags } : {}),
          ...(parsed.errorWorkflowId !== undefined ? { errorWorkflowId: parsed.errorWorkflowId } : {}),
          ...(parsed.timeoutMs !== undefined ? { timeoutMs: parsed.timeoutMs } : {}),
        });
      }
    };
    input.click();
  }

  function importGeneratedWorkflow(importedNodes: unknown[], importedEdges: unknown[]) {
    const offset = { x: 100, y: 100 };
    const typed = (importedNodes as Node<NodeData>[]).map((n) => ({
      ...n,
      position: { x: (n.position?.x ?? 0) + offset.x, y: (n.position?.y ?? 0) + offset.y },
    }));
    setNodes((prev) => [...prev, ...typed]);
    setEdges((prev) => [...prev, ...(importedEdges as Edge[])]);
    pushHistory([...nodes, ...typed], [...edges, ...(importedEdges as Edge[])]);
  }

  async function simulate() {
    if (simulating) return;
    setSimulating(true);
    setSimulateResult(null);
    try {
      const { data } = await api.post("/simulate", { nodes, edges, triggerData: {} });
      setSimulateResult(data as typeof simulateResult);
      setShowSimulatePanel(true);
    } catch {
      // silent — simulate errors don't block real work
    } finally {
      setSimulating(false);
    }
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

  // Compute input field suggestions from the last output of parent node(s)
  const inputSuggestions: string[] = (() => {
    if (!selectedNode) return [];
    const parentIds = edges.filter((e) => e.target === selectedNode.id).map((e) => e.source);
    const parentOutputs = parentIds
      .map((pid) => nodeLogs.find((l) => l.nodeId === pid)?.output)
      .filter((o): o is Record<string, unknown> => o !== null && o !== undefined && typeof o === "object" && !Array.isArray(o));
    if (parentOutputs.length === 0) return [];
    const merged = Object.assign({}, ...parentOutputs);
    function flatten(obj: Record<string, unknown>, prefix = "$input"): string[] {
      const keys: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith("_")) continue;
        const path = `${prefix}.${k}`;
        keys.push(path);
        if (v && typeof v === "object" && !Array.isArray(v)) {
          keys.push(...flatten(v as Record<string, unknown>, path));
        }
      }
      return keys;
    }
    return [...new Set(["$input", ...flatten(merged)])].slice(0, 40);
  })();

  const displayNodes = nodes.map((n) => {
    const status = nodeStatuses[n.id];
    const log = nodeLogs.find((l) => l.nodeId === n.id);
    const outputPreview = log?.output !== undefined
      ? JSON.stringify(log.output).slice(0, 60)
      : undefined;
    return {
      ...n,
      style: { ...n.style, ...nodeStyle(status) },
      data: {
        ...n.data,
        _status: status ?? (log?.status?.toLowerCase()),
        _outputPreview: outputPreview,
      },
    };
  });

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
        {stats && stats.total > 0 && (
          <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
            <span title="Total executions">{stats.total} runs</span>
            {stats.successRate !== null && (
              <span title="Success rate" className={stats.successRate >= 80 ? "text-green-400" : stats.successRate >= 50 ? "text-yellow-400" : "text-red-400"}>
                {stats.successRate}% ok
              </span>
            )}
            {stats.avgDurationMs !== null && (
              <span title="Average duration">
                avg {stats.avgDurationMs >= 1000 ? `${(stats.avgDurationMs / 1000).toFixed(1)}s` : `${stats.avgDurationMs}ms`}
              </span>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            onClick={importWorkflow}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition"
          >
            Import
          </button>
          <button
            onClick={() => setShowDreamGenerator(true)}
            className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-indigo-100 rounded-lg text-xs transition font-medium"
            title="Generate a workflow with DREAM AI"
          >
            ✦ Generate
          </button>
          <button
            onClick={simulate}
            disabled={simulating || nodes.length === 0}
            className="px-3 py-1.5 bg-cyan-800 hover:bg-cyan-700 text-cyan-100 rounded-lg text-xs transition font-medium disabled:opacity-40"
            title="DREAM dry-run — simulate without side effects"
          >
            {simulating ? "Simulating…" : "▷ Simulate"}
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
          <button
            onClick={toggleActive}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              workflow?.active
                ? "bg-green-700/60 hover:bg-green-700/80 text-green-300"
                : "bg-gray-700 hover:bg-gray-600 text-gray-400"
            }`}
            title={workflow?.active ? "Click to deactivate" : "Click to activate"}
          >
            {workflow?.active ? "● Active" : "○ Inactive"}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowSettings((s) => !s)}
              className={`px-3 py-1.5 rounded-lg text-xs transition ${showSettings ? "bg-gray-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
            >
              ⚙ Settings
            </button>
            {showSettings && (
              <div className="absolute right-0 top-9 z-50 w-72 bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-2xl">
                <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Workflow Settings</p>
                <label className="text-xs text-gray-400 block mb-1">Error Workflow</label>
                <select
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none"
                  value={workflow?.errorWorkflowId || ""}
                  onChange={(e) => setWorkflow((w) => (w ? { ...w, errorWorkflowId: e.target.value || undefined } : w))}
                >
                  <option value="">None</option>
                  {allWorkflows.filter((w) => w.id !== id).map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Triggered automatically when this workflow fails.</p>
                <label className="text-xs text-gray-400 block mt-3 mb-1">Execution Timeout (ms, default 300000)</label>
                <input
                  type="number"
                  min="1000"
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none"
                  value={workflow?.timeoutMs ?? ""}
                  placeholder="300000"
                  onChange={(e) => setWorkflow((w) => (w ? { ...w, timeoutMs: e.target.value ? Number(e.target.value) : null } : w))}
                />
                <label className="text-xs text-gray-400 block mt-3 mb-1">Max Concurrent Executions</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none"
                  value={workflow?.maxConcurrency ?? ""}
                  placeholder="Unlimited"
                  onChange={(e) => setWorkflow((w) => (w ? { ...w, maxConcurrency: e.target.value ? Number(e.target.value) : null } : w))}
                />
                <label className="text-xs text-gray-400 block mt-3 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none"
                  placeholder="production, crm, nightly"
                  value={(workflow?.tags ?? []).join(", ")}
                  onChange={(e) => {
                    const tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
                    setWorkflow((w) => (w ? { ...w, tags } : w));
                  }}
                />
                <label className="text-xs text-gray-400 block mt-3 mb-1">Description</label>
                <textarea
                  rows={3}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none resize-none"
                  placeholder="What does this workflow do?"
                  value={workflow?.description ?? ""}
                  onChange={(e) => setWorkflow((w) => (w ? { ...w, description: e.target.value || undefined } : w))}
                />
              </div>
            )}
          </div>
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

        <div
          className="flex-1 relative"
          ref={wrapperRef}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest(".react-flow__node")) return;
            onPaneDoubleClick(e);
          }}
        >
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
            onPaneClick={() => { setSelectedNode(null); setQuickAdd(null); }}
            fitView
            deleteKeyCode="Delete"
          >
            <Background color="#374151" gap={16} />
            <Controls />
            <MiniMap style={{ backgroundColor: "#111827" }} nodeColor="#1f2937" maskColor="#111827aa" />
          </ReactFlow>

          {/* Quick-add popup */}
          {quickAdd && (() => {
            const filtered = quickAddSearch
              ? NODE_TYPE_CONFIG.filter((n) => n.label.toLowerCase().includes(quickAddSearch.toLowerCase()) || n.description.toLowerCase().includes(quickAddSearch.toLowerCase()))
              : NODE_TYPE_CONFIG;
            return (
              <div
                className="absolute z-50 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-64 overflow-hidden"
                style={{ left: Math.min(quickAdd.x, window.innerWidth - 280), top: Math.min(quickAdd.y, window.innerHeight - 320) }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-2 border-b border-gray-700">
                  <input
                    autoFocus
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Search nodes…"
                    value={quickAddSearch}
                    onChange={(e) => setQuickAddSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setQuickAdd(null);
                      if (e.key === "Enter" && filtered.length > 0) addNodeFromQuickAdd(filtered[0].type);
                    }}
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {filtered.map((n) => (
                    <button
                      key={n.type}
                      onClick={() => addNodeFromQuickAdd(n.type)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 transition"
                    >
                      <span className={`w-6 h-6 rounded flex items-center justify-center text-xs shrink-0 ${n.color}`} />
                      <div>
                        <p className="text-white text-xs font-medium">{n.label}</p>
                        <p className="text-gray-500 text-xs">{n.description}</p>
                      </div>
                    </button>
                  ))}
                  {filtered.length === 0 && <p className="text-gray-600 text-xs text-center py-4">No nodes found</p>}
                </div>
              </div>
            );
          })()}
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
                      {(ex.status === "RUNNING" || ex.status === "PENDING") && (
                        <button
                          onClick={(e) => cancelExecution(ex.id, e)}
                          className="text-gray-500 hover:text-red-400 text-xs px-1 transition"
                          title="Cancel"
                        >
                          ✕
                        </button>
                      )}
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

        {selectedNode && isStudioNodeType(selectedNode.type ?? "") ? (
          <StudioNodePanel
            nodeType={selectedNode.type ?? ""}
            data={selectedNode.data as Record<string, unknown>}
            onChange={(data) => updateNodeData(selectedNode.id, data)}
            onClose={() => setSelectedNode(null)}
          />
        ) : selectedNode ? (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={(data) => updateNodeData(selectedNode.id, data)}
            onClose={() => setSelectedNode(null)}
            nodeLog={selectedNodeLog}
            inputSuggestions={inputSuggestions}
            webhookBaseUrl={import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}
            workflowId={id}
          />
        ) : null}
      </div>

      <ExecutionPanel
        nodeStatuses={nodeStatuses}
        nodeOutputs={nodeOutputs}
        nodeErrors={nodeErrors}
        executionId={executionId}
        nodes={nodes.map((n) => ({ id: n.id, label: n.data?.label as string | undefined, nodeType: (n.data?.nodeType || n.type) as string | undefined }))}
      />

      {showDreamGenerator && (
        <DreamGenerator
          onClose={() => setShowDreamGenerator(false)}
          onImport={importGeneratedWorkflow}
        />
      )}

      {showSimulatePanel && simulateResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl w-[680px] max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-700">
              <div>
                <h2 className="text-white font-bold text-base">DREAM Simulation</h2>
                <p className="text-gray-400 text-xs mt-0.5">Dry-run — no side effects executed</p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-3xl font-bold ${simulateResult.score.grade === "A" ? "text-green-400" : simulateResult.score.grade === "B" ? "text-yellow-400" : simulateResult.score.grade === "C" ? "text-orange-400" : "text-red-400"}`}>
                  {simulateResult.score.grade}
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold text-sm">{simulateResult.score.score}/100</div>
                  <div className="text-gray-500 text-xs">security score</div>
                </div>
                <button onClick={() => setShowSimulatePanel(false)} className="text-gray-500 hover:text-white text-xl ml-2">×</button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {/* Score badges */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "KNOLL gate", ok: simulateResult.score.hasKnoll },
                  { label: "APEX routing", ok: simulateResult.score.hasApex },
                  { label: "Error handling", ok: simulateResult.score.hasErrorHandling },
                  { label: "Output node", ok: simulateResult.score.hasOutputNode },
                ].map(({ label, ok }) => (
                  <span key={label} className={`text-xs px-2 py-1 rounded-full font-medium ${ok ? "bg-green-900/60 text-green-300" : "bg-gray-700 text-gray-500"}`}>
                    {ok ? "✓" : "✗"} {label}
                  </span>
                ))}
              </div>

              {/* Recommendations */}
              {simulateResult.score.recommendations.filter(Boolean).length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
                  <p className="text-yellow-400 text-xs font-semibold mb-1">Recommendations</p>
                  {simulateResult.score.recommendations.filter(Boolean).map((r, i) => (
                    <p key={i} className="text-yellow-300/80 text-xs leading-relaxed">• {r}</p>
                  ))}
                </div>
              )}

              {/* Trace */}
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">
                  Execution Trace — {simulateResult.summary.totalNodes} nodes ({simulateResult.summary.simulatedNodes} simulated, {simulateResult.summary.realNodes} pass-through)
                </p>
                <div className="space-y-1.5">
                  {simulateResult.trace.map((t, i) => {
                    const nodeLabel = nodes.find((n) => n.id === t.nodeId)?.data?.label || t.nodeType;
                    return (
                      <div key={t.nodeId} className="bg-gray-750/50 border border-gray-700/50 rounded-lg px-3 py-2 flex items-start gap-3">
                        <span className="text-gray-600 text-xs mt-0.5 w-4 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-200 text-xs font-medium truncate">{nodeLabel as string}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${t.simulated ? "bg-blue-900/60 text-blue-300" : "bg-gray-700 text-gray-400"}`}>
                              {t.simulated ? "simulated" : "pass-through"}
                            </span>
                          </div>
                          <pre className="text-gray-500 text-xs mt-1 truncate">{JSON.stringify(t.output).slice(0, 80)}…</pre>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
              <button onClick={() => setShowSimulatePanel(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
