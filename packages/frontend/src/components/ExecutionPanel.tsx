interface Props {
  nodeStatuses: Record<string, "running" | "success" | "error">;
  executionId: string | null;
}

const STATUS_COLORS = {
  running: "bg-yellow-400 animate-pulse",
  success: "bg-green-400",
  error: "bg-red-400",
} as const;

const STATUS_TEXT = {
  running: "text-yellow-400",
  success: "text-green-400",
  error: "text-red-400",
} as const;

export function ExecutionPanel({ nodeStatuses, executionId }: Props) {
  const entries = Object.entries(nodeStatuses);
  if (!executionId && entries.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 border border-gray-700 rounded-xl p-4 w-72 shadow-2xl z-50">
      <h4 className="text-white font-semibold text-sm mb-1">Live Execution</h4>
      {executionId && (
        <p className="text-gray-500 text-xs mb-3 font-mono truncate">{executionId}</p>
      )}
      {entries.length === 0 ? (
        <p className="text-gray-600 text-xs">Waiting for node events…</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([nodeId, status]) => (
            <div key={nodeId} className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[status]}`} />
              <span className="text-gray-400 truncate flex-1">{nodeId}</span>
              <span className={`capitalize shrink-0 ${STATUS_TEXT[status]}`}>{status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
