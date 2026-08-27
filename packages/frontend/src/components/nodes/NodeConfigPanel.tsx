import { useState } from "react";
import { DreamNodePanel } from "./DreamNodePanel";
import { VisionNodePanel } from "./VisionNodePanel";
import { KnollNodePanel } from "./KnollNodePanel";
import { ApexNodePanel } from "./ApexNodePanel";

interface Props {
  nodeType: string;
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  onClose?: () => void;
}

const STUDIO_TYPES = new Set([
  "dream",
  "simulate",
  "vision",
  "automation",
  "knoll",
  "apex",
]);

export function isStudioNodeType(type: string): boolean {
  return STUDIO_TYPES.has(type);
}

function GenericJsonPanel({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(data, null, 2));
  const [error, setError] = useState<string | null>(null);

  function handleChange(v: string) {
    setText(v);
    try {
      const parsed = JSON.parse(v) as Record<string, unknown>;
      setError(null);
      onChange(parsed);
    } catch {
      setError("Invalid JSON");
    }
  }

  return (
    <div className="p-4 space-y-2">
      <p className="text-gray-400 text-xs">Node Data (JSON)</p>
      <textarea
        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        rows={12}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

/**
 * StudioNodePanel — dispatcher that renders the studio-specific config panel
 * for DREAM, VISION, KNOLL, or APEX nodes, with a JSON fallback for unknown types.
 *
 * Named StudioNodePanel here to distinguish from the existing
 * components/NodeConfigPanel (generic workflow-node config).
 */
export function StudioNodePanel({ nodeType, data, onChange, onClose }: Props) {
  const title =
    nodeType.charAt(0).toUpperCase() + nodeType.slice(1);

  return (
    <aside className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-700">
        <h3 className="text-white font-semibold truncate">{title} Config</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-2xl leading-none ml-2"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {(nodeType === "dream" || nodeType === "simulate") && (
          <DreamNodePanel data={data} onChange={onChange} />
        )}
        {(nodeType === "vision" || nodeType === "automation") && (
          <VisionNodePanel data={data} onChange={onChange} />
        )}
        {nodeType === "knoll" && (
          <KnollNodePanel data={data} onChange={onChange} />
        )}
        {nodeType === "apex" && (
          <ApexNodePanel data={data} onChange={onChange} />
        )}
        {!isStudioNodeType(nodeType) && (
          <GenericJsonPanel data={data} onChange={onChange} />
        )}
      </div>
    </aside>
  );
}
