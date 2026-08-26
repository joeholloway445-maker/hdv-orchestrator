import { useState } from "react";
import api from "../api/client";

interface GeneratedStep {
  step: number;
  nodeType: string;
  label: string;
  description: string;
  config?: Record<string, unknown>;
}

interface GenerateResult {
  plan: string;
  steps: GeneratedStep[];
  nodes?: unknown[];
  edges?: unknown[];
  model?: string;
  usage?: unknown;
}

interface Props {
  onClose: () => void;
  onImport: (nodes: unknown[], edges: unknown[]) => void;
}

export function DreamGenerator({ onClose, onImport }: Props) {
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!intent.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post("/simulate/generate", { intent: intent.trim() });
      setResult(data as GenerateResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed — check ANTHROPIC_API_KEY");
    } finally {
      setLoading(false);
    }
  }

  function handleImport() {
    if (!result) return;
    const nodes = result.nodes ?? [];
    const edges = result.edges ?? [];
    onImport(nodes, edges);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-[640px] max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-700">
          <div>
            <h2 className="text-white font-semibold text-lg flex items-center gap-2">
              <span className="text-indigo-400">✦</span> DREAM Workflow Generator
            </h2>
            <p className="text-gray-400 text-xs mt-0.5">Describe what your workflow should do — DREAM will build it using Claude.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none ml-4">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Describe your workflow intent</label>
            <textarea
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              rows={4}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder={
                "e.g. \"When a webhook fires with a GitHub PR event, check it with KNOLL security, " +
                "summarize the diff with APEX, and post the summary to Slack.\""
              }
              onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) generate(); }}
            />
            <p className="text-xs text-gray-500 mt-1">Tip: ⌘↵ to generate</p>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800/50 rounded-lg px-4 py-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* Steps */}
              {result.steps?.length > 0 && (
                <div>
                  <label className="text-gray-400 text-xs mb-2 block">Generated workflow steps</label>
                  <div className="space-y-2">
                    {result.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-3 bg-gray-700/50 rounded-lg px-4 py-3">
                        <span className="text-indigo-400 font-mono text-sm font-bold mt-0.5">{step.step}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white text-sm font-medium">{step.label}</span>
                            <span className="bg-gray-600 text-gray-300 text-xs rounded px-1.5 py-0.5 font-mono">{step.nodeType}</span>
                          </div>
                          {step.description && (
                            <p className="text-gray-400 text-xs mt-0.5">{step.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw plan (collapsed by default) */}
              {result.plan && !result.steps?.length && (
                <div>
                  <label className="text-gray-400 text-xs mb-2 block">Generated plan</label>
                  <pre className="bg-gray-900 text-gray-300 rounded-lg p-4 text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                    {result.plan}
                  </pre>
                </div>
              )}

              {/* Model info */}
              {result.model && (
                <p className="text-xs text-gray-500">Generated by {result.model}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-4 border-t border-gray-700 flex gap-3">
          <button
            onClick={generate}
            disabled={loading || !intent.trim()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-medium transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating…
              </>
            ) : (
              "✦ Generate Workflow"
            )}
          </button>
          {result && (result.nodes?.length ?? 0) > 0 && (
            <button
              onClick={handleImport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition"
            >
              Import to Canvas
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg px-4 py-2.5 text-sm transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
