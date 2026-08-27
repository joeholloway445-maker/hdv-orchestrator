import { useState } from "react";
import { StudioGate } from "../StudioGate";

interface Props {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

const inputCls =
  "w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelCls = "text-gray-400 text-xs mb-1 block";

const MODEL_MAP: Record<string, Record<string, string>> = {
  reasoning: {
    low: "claude-haiku-4-5-20251001",
    medium: "claude-sonnet-4-6",
    high: "claude-opus-5",
  },
  code: {
    low: "claude-haiku-4-5-20251001",
    medium: "claude-sonnet-4-6",
    high: "claude-sonnet-5",
  },
  creative: {
    low: "claude-haiku-4-5-20251001",
    medium: "claude-sonnet-5",
    high: "claude-opus-5",
  },
  vision: {
    low: "claude-haiku-4-5-20251001",
    medium: "claude-sonnet-4-6",
    high: "claude-opus-5",
  },
  fast: {
    low: "claude-haiku-4-5-20251001",
    medium: "claude-haiku-4-5-20251001",
    high: "claude-sonnet-4-6",
  },
};

const BUDGETS = ["low", "medium", "high"] as const;

export function ApexNodePanel({ data, onChange }: Props) {
  const [local, setLocal] = useState<Record<string, unknown>>(data);

  function patch(partial: Record<string, unknown>) {
    const next = { ...local, ...partial };
    setLocal(next);
    onChange(next);
  }

  const taskType = (local.taskType as string) || "reasoning";
  const budget = (local.budget as string) || "medium";
  const useGpuBurst = !!local.useGpuBurst;
  const modelOverride = (local.modelOverride as string) || "";
  const autoRoute =
    modelOverride ||
    MODEL_MAP[taskType]?.[budget] ||
    "claude-sonnet-4-6";

  return (
    <StudioGate studio="APEX">
      <div className="space-y-4 p-4">
        <div>
          <label className={labelCls}>Task Type</label>
          <select
            className={inputCls}
            value={taskType}
            onChange={(e) => patch({ taskType: e.target.value })}
          >
            <option value="reasoning">Reasoning</option>
            <option value="code">Code</option>
            <option value="creative">Creative</option>
            <option value="vision">Vision</option>
            <option value="fast">Fast</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Budget</label>
          <div className="flex gap-2">
            {BUDGETS.map((b) => (
              <button
                key={b}
                onClick={() => patch({ budget: b })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition ${
                  budget === b
                    ? "bg-purple-700 text-white"
                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useGpuBurst}
            onChange={(e) => patch({ useGpuBurst: e.target.checked })}
            className="accent-purple-500"
          />
          <span className="text-gray-300 text-sm">Use GPU burst</span>
          <span className="text-xs text-gray-500">(routes to GPU marketplace)</span>
        </label>

        <div>
          <label className={labelCls}>Model Override (optional)</label>
          <input
            className={inputCls + " font-mono"}
            value={modelOverride}
            onChange={(e) => patch({ modelOverride: e.target.value })}
            placeholder="Leave blank for auto APEX routing"
          />
        </div>

        <div className="bg-gray-900/60 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Current route</p>
          <p className="text-sm font-mono text-purple-300">→ {autoRoute}</p>
          {useGpuBurst && (
            <p className="text-xs text-yellow-400 mt-1">+ GPU burst enabled</p>
          )}
        </div>
      </div>
    </StudioGate>
  );
}
