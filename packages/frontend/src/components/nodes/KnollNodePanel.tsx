import { useState } from "react";
import { StudioGate } from "../StudioGate";

interface Props {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

const inputCls =
  "w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelCls = "text-gray-400 text-xs mb-1 block";

const ALL_RULES = [
  { id: "no_external_calls", label: "No external calls" },
  { id: "no_secrets_in_output", label: "No secrets in output" },
  { id: "require_signed_payload", label: "Require signed payload" },
  { id: "rate_limit", label: "Rate limit enforcement" },
];

export function KnollNodePanel({ data, onChange }: Props) {
  const [local, setLocal] = useState<Record<string, unknown>>(data);

  function patch(partial: Record<string, unknown>) {
    const next = { ...local, ...partial };
    setLocal(next);
    onChange(next);
  }

  const policy = (local.policy as string) || "standard";
  const rules = (local.rules as string[]) || ["no_secrets_in_output", "rate_limit"];
  const maxRiskScore =
    typeof local.maxRiskScore === "number" ? local.maxRiskScore : 50;
  const blockOnViolation = local.blockOnViolation !== false;

  function toggleRule(id: string) {
    const next = rules.includes(id)
      ? rules.filter((r) => r !== id)
      : [...rules, id];
    patch({ rules: next });
  }

  return (
    <StudioGate studio="KNOLL">
      <div className="space-y-4 p-4">
        <div>
          <label className={labelCls}>Security Policy</label>
          <select
            className={inputCls}
            value={policy}
            onChange={(e) => patch({ policy: e.target.value })}
          >
            <option value="strict">Strict — zero tolerance</option>
            <option value="standard">Standard — balanced</option>
            <option value="permissive">Permissive — auditing only</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Rules to Enforce</label>
          <div className="space-y-2 mt-1">
            {ALL_RULES.map((r) => (
              <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rules.includes(r.id)}
                  onChange={() => toggleRule(r.id)}
                  className="accent-red-500"
                />
                <span className="text-gray-300 text-sm">{r.label}</span>
                <code className="text-xs text-gray-500 font-mono">{r.id}</code>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>
            Max Allowed Risk Score: {maxRiskScore}
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={maxRiskScore}
            onChange={(e) =>
              patch({ maxRiskScore: parseInt(e.target.value) })
            }
            className="w-full accent-red-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-0.5">
            <span>0 most strict</span>
            <span>100 most lenient</span>
          </div>
        </div>

        <div>
          <label className={labelCls}>Violation Response</label>
          <div className="flex gap-2">
            <button
              onClick={() => patch({ blockOnViolation: true })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                blockOnViolation
                  ? "bg-red-700 text-white"
                  : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              }`}
            >
              Block
            </button>
            <button
              onClick={() => patch({ blockOnViolation: false })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                !blockOnViolation
                  ? "bg-yellow-700 text-white"
                  : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              }`}
            >
              Warn Only
            </button>
          </div>
        </div>
      </div>
    </StudioGate>
  );
}
