import { useState } from "react";
import { StudioGate } from "../StudioGate";

interface Props {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

const inputCls =
  "w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelCls = "text-gray-400 text-xs mb-1 block";

export function DreamNodePanel({ data, onChange }: Props) {
  const [local, setLocal] = useState<Record<string, unknown>>(data);

  function patch(partial: Record<string, unknown>) {
    const next = { ...local, ...partial };
    setLocal(next);
    onChange(next);
  }

  const intent = (local.intent as string) || "";
  const temperature =
    typeof local.temperature === "number" ? local.temperature : 0.7;
  const maxTokens =
    typeof local.maxTokens === "number" ? local.maxTokens : 2048;
  const dryRun = !!local.dryRun;

  return (
    <StudioGate studio="DREAM">
      <div className="space-y-4 p-4">
        <div>
          <label className={labelCls}>Intent</label>
          <textarea
            className={inputCls + " resize-none"}
            rows={4}
            value={intent}
            onChange={(e) => patch({ intent: e.target.value })}
            placeholder="Describe what this workflow step should generate..."
          />
        </div>

        <div>
          <label className={labelCls}>
            Temperature: {temperature.toFixed(1)}
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={temperature}
            onChange={(e) => patch({ temperature: parseFloat(e.target.value) })}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-0.5">
            <span>0.0 precise</span>
            <span>1.0 creative</span>
          </div>
        </div>

        <div>
          <label className={labelCls}>Max Tokens</label>
          <input
            type="number"
            className={inputCls}
            min={1}
            max={16384}
            value={maxTokens}
            onChange={(e) =>
              patch({ maxTokens: parseInt(e.target.value) || 2048 })
            }
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => patch({ dryRun: e.target.checked })}
            className="accent-indigo-500"
          />
          <span className="text-gray-300 text-sm">
            Dry-run simulation (POST /simulate)
          </span>
        </label>

        {dryRun && (
          <p className="text-xs text-indigo-400 bg-indigo-900/30 rounded p-2">
            Simulation mode: workflow runs without side effects. Results appear
            in the DREAM Simulation panel.
          </p>
        )}
      </div>
    </StudioGate>
  );
}
