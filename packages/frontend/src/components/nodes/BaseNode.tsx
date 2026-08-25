import { Handle, Position } from "reactflow";

interface Props {
  data: { label?: string; [key: string]: unknown };
  selected?: boolean;
  color: string;
  icon: string;
  hasInput?: boolean;
  hasOutput?: boolean;
  hasTrueOutput?: boolean;
  hasFalseOutput?: boolean;
}

export function BaseNode({ data, selected, color, icon, hasInput = true, hasOutput = true, hasTrueOutput, hasFalseOutput }: Props) {
  return (
    <div
      className={`rounded-xl shadow-lg border-2 transition-all ${selected ? "border-white" : "border-transparent"} ${color} min-w-[160px]`}
      style={{ minWidth: 160 }}
    >
      {hasInput && <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-gray-300 !border-2 !border-gray-600" />}

      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-white font-semibold text-sm truncate">{data.label || "Node"}</span>
        </div>
      </div>

      {hasOutput && !hasTrueOutput && !hasFalseOutput && (
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-gray-300 !border-2 !border-gray-600" />
      )}
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
    </div>
  );
}
