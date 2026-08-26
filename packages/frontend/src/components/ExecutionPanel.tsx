import { useState } from "react";

interface NodeInfo {
  id: string;
  label?: string;
  nodeType?: string;
}

interface Props {
  nodeStatuses: Record<string, "running" | "success" | "error" | "skipped">;
  nodeOutputs: Record<string, unknown>;
  nodeErrors: Record<string, string>;
  executionId: string | null;
  nodes: NodeInfo[];
}

const STATUS_DOT = {
  running: "bg-yellow-400 animate-pulse",
  success: "bg-green-400",
  error: "bg-red-400",
  skipped: "bg-gray-500",
} as const;

const STATUS_TEXT = {
  running: "text-yellow-400",
  success: "text-green-400",
  error: "text-red-500",
  skipped: "text-gray-500",
} as const;

function nodeLabel(nodeId: string, nodes: NodeInfo[]): string {
  const n = nodes.find((x) => x.id === nodeId);
  return n?.label || n?.nodeType || nodeId;
}

function JsonPreview({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const trimmed = text.length > 400 ? text.slice(0, 400) + "…" : text;
  return (
    <pre className="mt-1 text-xs bg-gray-900 text-gray-300 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
      {trimmed}
    </pre>
  );
}

export function ExecutionPanel({ nodeStatuses, nodeOutputs, nodeErrors, executionId, nodes }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const entries = Object.entries(nodeStatuses);
  if (!executionId && entries.length === 0) return null;

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 w-80 max-h-[70vh] flex flex-col">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between shrink-0">
        <h4 className="text-white font-semibold text-sm">Live Execution</h4>
        {executionId && (
          <span className="text-gray-500 text-xs font-mono truncate max-w-[140px]">{executionId.slice(-8)}</span>
        )}
      </div>

      <div className="overflow-y-auto p-3 space-y-1.5 flex-1">
        {entries.length === 0 ? (
          <p className="text-gray-600 text-xs px-1">Waiting for node events…</p>
        ) : (
          entries.map(([nodeId, status]) => {
            const label = nodeLabel(nodeId, nodes);
            const hasDetail = nodeOutputs[nodeId] !== undefined || nodeErrors[nodeId];
            const isOpen = expanded[nodeId];
            return (
              <div key={nodeId} className="rounded-lg bg-gray-750/50 border border-gray-700/50">
                <button
                  className="w-full flex items-center gap-2 text-xs px-3 py-2 text-left"
                  onClick={() => hasDetail && toggle(nodeId)}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                  <span className="text-gray-300 truncate flex-1">{label}</span>
                  <span className={`capitalize shrink-0 ${STATUS_TEXT[status]}`}>{status}</span>
                  {hasDetail && (
                    <span className="text-gray-600 ml-1">{isOpen ? "▲" : "▼"}</span>
                  )}
                </button>
                {isOpen && (
                  <div className="px-3 pb-2">
                    {nodeErrors[nodeId] && (
                      <p className="text-red-400 text-xs break-words">{nodeErrors[nodeId]}</p>
                    )}
                    {nodeOutputs[nodeId] !== undefined && !nodeErrors[nodeId] && (
                      <JsonPreview value={nodeOutputs[nodeId]} />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
