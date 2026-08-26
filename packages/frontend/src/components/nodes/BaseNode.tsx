import { Handle, Position } from "reactflow";

interface Props {
  data: { label?: string; cases?: Array<{ value: string; output: string }>; _status?: string; _outputPreview?: string; [key: string]: unknown };
  selected?: boolean;
  color: string;
  icon: string;
  hasInput?: boolean;
  hasOutput?: boolean;
  hasTrueOutput?: boolean;
  hasFalseOutput?: boolean;
  hasSwitchOutputs?: boolean;
  hasErrorOutput?: boolean;
}

const STATUS_DOT: Record<string, string> = {
  running: "bg-blue-400 animate-pulse",
  success: "bg-green-400",
  error: "bg-red-400",
  skipped: "bg-gray-500",
};

export function BaseNode({
  data,
  selected,
  color,
  icon,
  hasInput = true,
  hasOutput = true,
  hasTrueOutput,
  hasFalseOutput,
  hasSwitchOutputs,
  hasErrorOutput,
}: Props) {
  const switchCases = hasSwitchOutputs ? (data.cases as Array<{ value: string; output: string }> || []) : [];
  const switchOutputIds = hasSwitchOutputs
    ? [...switchCases.map((c) => c.output), "default"]
    : [];

  const totalHandles =
    hasTrueOutput && hasFalseOutput ? 2
    : hasSwitchOutputs ? switchOutputIds.length
    : hasOutput ? 1
    : 0;

  const statusDot = data._status ? STATUS_DOT[data._status] : null;

  return (
    <div
      className={`rounded-xl shadow-lg border-2 transition-all ${selected ? "border-white" : "border-transparent"} ${color}`}
      style={{ minWidth: 160 }}
    >
      {hasInput && (
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-gray-300 !border-2 !border-gray-600" />
      )}

      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-white font-semibold text-sm truncate flex-1">{data.label || "Node"}</span>
          {!!data._pinnedData && (
            <span title="Output pinned" className="text-xs opacity-70">📌</span>
          )}
          {statusDot && (
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} title={data._status} />
          )}
        </div>
        {data._outputPreview && (
          <div className="mt-1.5 text-xs text-white/60 font-mono truncate max-w-[140px]" title={data._outputPreview as string}>
            {data._outputPreview}
          </div>
        )}
      </div>

      {/* Default single output */}
      {hasOutput && !hasTrueOutput && !hasFalseOutput && !hasSwitchOutputs && (
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-gray-300 !border-2 !border-gray-600" />
      )}

      {/* IF branch true/false outputs */}
      {hasTrueOutput && (
        <Handle
          type="source"
          position={Position.Right}
          id="true"
          style={{ top: "35%" }}
          className="!w-3 !h-3 !bg-green-400 !border-2 !border-gray-600"
        />
      )}
      {hasFalseOutput && (
        <Handle
          type="source"
          position={Position.Right}
          id="false"
          style={{ top: "65%" }}
          className="!w-3 !h-3 !bg-red-400 !border-2 !border-gray-600"
        />
      )}

      {/* Switch dynamic outputs */}
      {hasSwitchOutputs && switchOutputIds.map((outId, i) => (
        <Handle
          key={outId}
          type="source"
          position={Position.Right}
          id={outId}
          style={{ top: `${((i + 1) / (switchOutputIds.length + 1)) * 100}%` }}
          className="!w-3 !h-3 !bg-yellow-400 !border-2 !border-gray-600"
        />
      ))}

      {/* Error output handle (orange, bottom-right) */}
      {hasErrorOutput && (
        <Handle
          type="source"
          position={Position.Right}
          id="error"
          style={{ top: totalHandles > 0 ? "80%" : "50%" }}
          className="!w-3 !h-3 !bg-orange-400 !border-2 !border-gray-600"
        />
      )}
    </div>
  );
}
