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
  [key: string]: unknown;
}

interface Props {
  node: Node<NodeData>;
  onUpdate: (data: Partial<NodeData>) => void;
  onClose: () => void;
  webhookBaseUrl?: string;
}

export function NodeConfigPanel({ node, onUpdate, onClose, webhookBaseUrl = "http://localhost:4000" }: Props) {
  const [local, setLocal] = useState<NodeData>(node.data);

  useEffect(() => {
    setLocal(node.data);
  }, [node.id]);

  const nodeType = local.nodeType;

  function patch(partial: Partial<NodeData>) {
    setLocal((prev) => ({ ...prev, ...partial }));
  }

  function generateWebhookId() {
    patch({ webhookId: Math.random().toString(36).slice(2, 10) });
  }

  return (
    <aside className="w-80 bg-gray-800 border-l border-gray-700 p-5 overflow-y-auto shrink-0">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-white font-semibold truncate">{local.label || nodeType}</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-2xl leading-none ml-2"
        >
          ×
        </button>
      </div>

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
                Body (JSON — use {`{{$input.field}}`} for interpolation)
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
            <label className="text-gray-400 text-xs mb-1 block">
              JavaScript (runs in isolated sandbox — return the output value)
            </label>
            <textarea
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none resize-none"
              rows={12}
              value={local.code || ""}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder={"// $input contains the previous node's output\nreturn { ...$input, processed: true };"}
            />
          </div>
        )}

        <button
          onClick={() => onUpdate(local)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition"
        >
          Apply
        </button>
      </div>
    </aside>
  );
}
