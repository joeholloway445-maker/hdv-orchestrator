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

interface NodeData {
  label?: string;
  nodeType?: string;
  webhookId?: string;
  method?: string;
  url?: string;
  body?: string;
  code?: string;
  [key: string]: unknown;
}

interface WorkflowRecord {
  id: string;
  name: string;
  active: boolean;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

type NodeStatus = "running" | "success" | "error";

const NODE_TYPE_CONFIG = [
  { type: "webhookTrigger", label: "Webhook Trigger", color: "bg-purple-600", description: "Listens for HTTP POSTs" },
  { type: "httpRequest", label: "HTTP Request", color: "bg-blue-600", description: "Calls an external URL" },
  { type: "code", label: "Code", color: "bg-orange-600", description: "Runs sandboxed JS" },
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

  const socketRef = useRef<Socket | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // Load workflow
  useEffect(() => {
    api.get(`/workflows/${id}`).then(({ data }) => {
      const wf = data as WorkflowRecord;
      setWorkflow(wf);
      setNodes((wf.nodes as Node<NodeData>[]) || []);
      setEdges((wf.edges as Edge[]) || []);
    });
  }, [id]);

  // WebSocket setup
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
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  // Join execution room when executionId is set
  useEffect(() => {
    if (executionId) socketRef.current?.emit("join-execution", executionId);
  }, [executionId]);

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
        type: "default",
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
    await api.put(`/workflows/${id}`, { nodes, edges, name: workflow?.name });
    setSaving(false);
  }

  async function execute() {
    await save();
    setNodeStatuses({});
    setExecuting(true);
    setExecutionId(null);
    const { data } = await api.post(`/workflows/${id}/execute`);
    setExecutionId((data as { id: string }).id);
  }

  function updateNodeData(nodeId: string, newData: Partial<NodeData>) {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n))
    );
    setSelectedNode((prev) =>
      prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...newData } } : prev
    );
  }

  // Inject status ring into nodes via style
  const displayNodes = nodes.map((n) => ({
    ...n,
    style: { ...n.style, ...nodeStyle(nodeStatuses[n.id]) },
  }));

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white text-sm transition">
          ← Back
        </button>
        <input
          className="bg-transparent text-white font-semibold text-lg focus:outline-none border-b border-transparent hover:border-gray-600 focus:border-blue-500 px-1 min-w-0 flex-1"
          value={workflow?.name || ""}
          onChange={(e) => setWorkflow((w) => w ? { ...w, name: e.target.value } : w)}
        />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={workflow?.active || false}
              onChange={(e) => setWorkflow((w) => w ? { ...w, active: e.target.checked } : w)}
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

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={(data) => updateNodeData(selectedNode.id, data)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      <ExecutionPanel nodeStatuses={nodeStatuses} executionId={executionId} />
    </div>
  );
}
