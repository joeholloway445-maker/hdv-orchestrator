import { useEffect, useState } from "react";
import type { Node } from "reactflow";

interface NodeData {
  label?: string;
  nodeType?: string;
  webhookId?: string;
  method?: string;
  url?: string;
  body?: string;
  code?: string;
  condition?: string;
  mappings?: Array<{ key: string; value: string }>;
  key?: string;
  workflowId?: string;
  [key: string]: unknown;
}

interface NodeLog {
  id: string;
  nodeId: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

interface Props {
  node: Node<NodeData>;
  onUpdate: (data: Partial<NodeData>) => void;
  onClose: () => void;
  webhookBaseUrl?: string;
  nodeLog?: NodeLog | null;
}

export function NodeConfigPanel({
  node,
  onUpdate,
  onClose,
  webhookBaseUrl = "http://localhost:4000",
  nodeLog,
}: Props) {
  const [local, setLocal] = useState<NodeData>(node.data);
  const [tab, setTab] = useState<"config" | "output">("config");

  useEffect(() => {
    setLocal(node.data);
    setTab("config");
  }, [node.id]);

  useEffect(() => {
    if (nodeLog) setTab("output");
  }, [nodeLog]);

  const nodeType = local.nodeType;

  function patch(partial: Partial<NodeData>) {
    setLocal((prev) => ({ ...prev, ...partial }));
  }

  function generateWebhookId() {
    patch({ webhookId: Math.random().toString(36).slice(2, 10) });
  }

  const mappings = local.mappings || [];

  return (
    <aside className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-700">
        <h3 className="text-white font-semibold truncate">{local.label || nodeType}</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none ml-2">
          ×
        </button>
      </div>

      {nodeLog && (
        <div className="flex border-b border-gray-700">
          {(["config", "output"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition ${
                tab === t ? "text-white border-b-2 border-blue-500" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5">
        {tab === "output" && nodeLog ? (
          <div className="space-y-4">
            <div>
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                  nodeLog.status === "SUCCESS"
                    ? "bg-green-900 text-green-300"
                    : nodeLog.status === "ERROR"
                      ? "bg-red-900 text-red-300"
                      : "bg-yellow-900 text-yellow-300"
                }`}
              >
                {nodeLog.status}
              </span>
              {nodeLog.finishedAt && (
                <span className="text-gray-500 text-xs ml-2">
                  {Math.round(
                    (new Date(nodeLog.finishedAt).getTime() - new Date(nodeLog.startedAt).getTime())
                  )}ms
                </span>
              )}
            </div>
            {nodeLog.error && (
              <div>
                <label className="text-red-400 text-xs mb-1 block">Error</label>
                <pre className="bg-gray-900 text-red-300 rounded-lg p-3 text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                  {nodeLog.error}
                </pre>
              </div>
            )}
            {nodeLog.input !== undefined && (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Input</label>
                <pre className="bg-gray-900 text-gray-300 rounded-lg p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                  {JSON.stringify(nodeLog.input, null, 2)}
                </pre>
              </div>
            )}
            {nodeLog.output !== undefined && (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Output</label>
                <pre className="bg-gray-900 text-green-300 rounded-lg p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                  {JSON.stringify(nodeLog.output, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Label</label>
              <input
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={local.label || ""}
                onChange={(e) => patch({ label: e.target.value })}
              />
            </div>

            {nodeType === "webhookTrigger" && (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Webhook ID</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none font-mono"
                    value={local.webhookId || ""}
                    readOnly
                    placeholder="Click Generate"
                  />
                  <button
                    onClick={generateWebhookId}
                    className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-3 text-sm transition"
                  >
                    Gen
                  </button>
                </div>
                {local.webhookId && (
                  <p className="text-xs text-gray-500 mt-1 font-mono break-all">
                    POST {webhookBaseUrl}/webhooks/trigger/{local.webhookId}
                  </p>
                )}
              </div>
            )}

            {nodeType === "httpRequest" && (
              <>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Method</label>
                  <select
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={local.method || "GET"}
                    onChange={(e) => patch({ method: e.target.value })}
                  >
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">URL</label>
                  <input
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={local.url || ""}
                    onChange={(e) => patch({ url: e.target.value })}
                    placeholder="https://api.example.com/endpoint"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">
                    Body (JSON — use {`{{$input.field}}`})
                  </label>
                  <textarea
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none resize-none"
                    rows={4}
                    value={local.body || ""}
                    onChange={(e) => patch({ body: e.target.value })}
                    placeholder={'{"key": "{{$input.value}}"}'}
                  />
                </div>
              </>
            )}

            {nodeType === "code" && (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">JavaScript (return output)</label>
                <textarea
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none resize-none"
                  rows={12}
                  value={local.code || ""}
                  onChange={(e) => patch({ code: e.target.value })}
                  placeholder={"// $input = previous output\nreturn { ...$input, processed: true };"}
                />
              </div>
            )}

            {nodeType === "ifBranch" && (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  Condition (JS expression, can use $input)
                </label>
                <textarea
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none resize-none"
                  rows={3}
                  value={local.condition || ""}
                  onChange={(e) => patch({ condition: e.target.value })}
                  placeholder="$input.status === 'active'"
                />
                <p className="text-xs text-gray-500 mt-1">Green handle = true · Red handle = false</p>
              </div>
            )}

            {nodeType === "set" && (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Field Mappings</label>
                <div className="space-y-2">
                  {mappings.map((m, i) => (
                    <div key={i} className="flex gap-1">
                      <input
                        className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none"
                        placeholder="key"
                        value={m.key}
                        onChange={(e) => {
                          const next = [...mappings];
                          next[i] = { ...next[i], key: e.target.value };
                          patch({ mappings: next });
                        }}
                      />
                      <input
                        className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none"
                        placeholder="{{$input.field}}"
                        value={m.value}
                        onChange={(e) => {
                          const next = [...mappings];
                          next[i] = { ...next[i], value: e.target.value };
                          patch({ mappings: next });
                        }}
                      />
                      <button
                        onClick={() => patch({ mappings: mappings.filter((_, j) => j !== i) })}
                        className="text-gray-500 hover:text-red-400 px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => patch({ mappings: [...mappings, { key: "", value: "" }] })}
                    className="text-blue-400 text-xs hover:underline"
                  >
                    + Add field
                  </button>
                </div>
              </div>
            )}

            {(nodeType === "memoryRead" || nodeType === "memoryWrite") && (
              <>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Memory Key</label>
                  <input
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={(local.key as string) || ""}
                    onChange={(e) => patch({ key: e.target.value })}
                    placeholder="my_key"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Scope (workflow ID or leave blank for global)</label>
                  <input
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={(local.workflowId as string) || ""}
                    onChange={(e) => patch({ workflowId: e.target.value })}
                    placeholder="(optional)"
                  />
                </div>
              </>
            )}

            <button
              onClick={() => onUpdate(local)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition"
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
