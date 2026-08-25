import { useEffect, useState } from "react";
import type { Node } from "reactflow";
import api from "../api/client";

interface NodeData {
  label?: string;
  nodeType?: string;
  webhookId?: string;
  method?: string;
  url?: string;
  body?: string;
  credentialId?: string;
  credentialInject?: string;
  code?: string;
  condition?: string;
  mappings?: Array<{ key: string; value: string }>;
  cases?: Array<{ value: string; output: string }>;
  field?: string;
  defaultOutput?: string;
  key?: string;
  workflowId?: string;
  cronExpression?: string;
  arrayKey?: string;
  duration?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  from?: string;
  to?: string;
  subject?: string;
  body2?: string;
  targetWorkflowId?: string;
  statusCode?: string;
  responseBody?: string;
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

interface Credential {
  id: string;
  name: string;
  type: string;
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
  const [credentials, setCredentials] = useState<Credential[]>([]);

  useEffect(() => {
    setLocal(node.data);
    setTab("config");
  }, [node.id]);

  useEffect(() => {
    if (nodeLog) setTab("output");
  }, [nodeLog]);

  useEffect(() => {
    api.get("/credentials").then(({ data }) => setCredentials(data as Credential[])).catch(() => {});
  }, []);

  const nodeType = local.nodeType;

  function patch(partial: Partial<NodeData>) {
    setLocal((prev) => ({ ...prev, ...partial }));
  }

  function generateWebhookId() {
    patch({ webhookId: Math.random().toString(36).slice(2, 10) });
  }

  const mappings = local.mappings || [];
  const cases = local.cases || [];

  const inputCls = "w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
  const labelCls = "text-gray-400 text-xs mb-1 block";

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
                    new Date(nodeLog.finishedAt).getTime() - new Date(nodeLog.startedAt).getTime(),
                  )}ms
                </span>
              )}
            </div>
            {nodeLog.error && (
              <div>
                <label className={labelCls + " !text-red-400"}>Error</label>
                <pre className="bg-gray-900 text-red-300 rounded-lg p-3 text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                  {nodeLog.error}
                </pre>
              </div>
            )}
            {nodeLog.input !== undefined && (
              <div>
                <label className={labelCls}>Input</label>
                <pre className="bg-gray-900 text-gray-300 rounded-lg p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                  {JSON.stringify(nodeLog.input, null, 2)}
                </pre>
              </div>
            )}
            {nodeLog.output !== undefined && (
              <div>
                <label className={labelCls}>Output</label>
                <pre className="bg-gray-900 text-green-300 rounded-lg p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                  {JSON.stringify(nodeLog.output, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Label — always shown */}
            <div>
              <label className={labelCls}>Label</label>
              <input className={inputCls} value={local.label || ""} onChange={(e) => patch({ label: e.target.value })} />
            </div>

            {/* Webhook Trigger */}
            {nodeType === "webhookTrigger" && (
              <div>
                <label className={labelCls}>Webhook ID</label>
                <div className="flex gap-2">
                  <input className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none font-mono" value={local.webhookId || ""} readOnly placeholder="Click Generate" />
                  <button onClick={generateWebhookId} className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-3 text-sm transition">Gen</button>
                </div>
                {local.webhookId && (
                  <p className="text-xs text-gray-500 mt-1 font-mono break-all">POST {webhookBaseUrl}/webhooks/trigger/{local.webhookId}</p>
                )}
              </div>
            )}

            {/* Schedule Trigger */}
            {nodeType === "scheduleTrigger" && (
              <div>
                <label className={labelCls}>Cron Expression</label>
                <input className={inputCls + " font-mono"} value={local.cronExpression || ""} onChange={(e) => patch({ cronExpression: e.target.value })} placeholder="*/5 * * * *" />
                <p className="text-xs text-gray-500 mt-1">Workflow must be Active to run · min hour day month weekday</p>
              </div>
            )}

            {/* HTTP Request */}
            {nodeType === "httpRequest" && (
              <>
                <div>
                  <label className={labelCls}>Method</label>
                  <select className={inputCls} value={local.method || "GET"} onChange={(e) => patch({ method: e.target.value })}>
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>URL</label>
                  <input className={inputCls} value={local.url || ""} onChange={(e) => patch({ url: e.target.value })} placeholder="https://api.example.com/endpoint" />
                </div>
                <div>
                  <label className={labelCls}>Body (JSON — use {`{{$input.field}}`})</label>
                  <textarea className={inputCls + " font-mono resize-none"} rows={4} value={local.body || ""} onChange={(e) => patch({ body: e.target.value })} placeholder={'{"key": "{{$input.value}}"}'} />
                </div>
                {credentials.length > 0 && (
                  <>
                    <div>
                      <label className={labelCls}>Credential (optional)</label>
                      <select className={inputCls} value={local.credentialId || ""} onChange={(e) => patch({ credentialId: e.target.value || undefined })}>
                        <option value="">— none —</option>
                        {credentials.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                      </select>
                    </div>
                    {local.credentialId && (
                      <div>
                        <label className={labelCls}>Inject As</label>
                        <select className={inputCls} value={local.credentialInject || "bearer"} onChange={(e) => patch({ credentialInject: e.target.value })}>
                          <option value="bearer">Bearer token (Authorization header)</option>
                          <option value="header">Custom header (headerName + headerValue)</option>
                        </select>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* Code */}
            {nodeType === "code" && (
              <div>
                <label className={labelCls}>JavaScript (return output)</label>
                <textarea className={inputCls + " font-mono resize-none"} rows={12} value={local.code || ""} onChange={(e) => patch({ code: e.target.value })} placeholder={"// $input = previous output\nreturn { ...$input, processed: true };"} />
              </div>
            )}

            {/* IF Branch */}
            {nodeType === "ifBranch" && (
              <div>
                <label className={labelCls}>Condition (JS — can use $input)</label>
                <textarea className={inputCls + " font-mono resize-none"} rows={3} value={local.condition || ""} onChange={(e) => patch({ condition: e.target.value })} placeholder="$input.status === 'active'" />
                <p className="text-xs text-gray-500 mt-1">Green handle = true · Red handle = false</p>
              </div>
            )}

            {/* Set */}
            {nodeType === "set" && (
              <div>
                <label className={labelCls}>Field Mappings</label>
                <div className="space-y-2">
                  {mappings.map((m, i) => (
                    <div key={i} className="flex gap-1">
                      <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="key" value={m.key} onChange={(e) => { const n = [...mappings]; n[i] = { ...n[i], key: e.target.value }; patch({ mappings: n }); }} />
                      <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="{{$input.field}}" value={m.value} onChange={(e) => { const n = [...mappings]; n[i] = { ...n[i], value: e.target.value }; patch({ mappings: n }); }} />
                      <button onClick={() => patch({ mappings: mappings.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-400 px-1">×</button>
                    </div>
                  ))}
                  <button onClick={() => patch({ mappings: [...mappings, { key: "", value: "" }] })} className="text-blue-400 text-xs hover:underline">+ Add field</button>
                </div>
              </div>
            )}

            {/* Loop */}
            {nodeType === "loop" && (
              <>
                <div>
                  <label className={labelCls}>Array Field Name</label>
                  <input className={inputCls} value={local.arrayKey || ""} onChange={(e) => patch({ arrayKey: e.target.value })} placeholder="items" />
                  <p className="text-xs text-gray-500 mt-1">Field on $input that holds the array to iterate</p>
                </div>
                <div>
                  <label className={labelCls}>Item Mappings (optional)</label>
                  <div className="space-y-2">
                    {mappings.map((m, i) => (
                      <div key={i} className="flex gap-1">
                        <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="key" value={m.key} onChange={(e) => { const n = [...mappings]; n[i] = { ...n[i], key: e.target.value }; patch({ mappings: n }); }} />
                        <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="{{item.field}}" value={m.value} onChange={(e) => { const n = [...mappings]; n[i] = { ...n[i], value: e.target.value }; patch({ mappings: n }); }} />
                        <button onClick={() => patch({ mappings: mappings.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-400 px-1">×</button>
                      </div>
                    ))}
                    <button onClick={() => patch({ mappings: [...mappings, { key: "", value: "" }] })} className="text-blue-400 text-xs hover:underline">+ Add mapping</button>
                  </div>
                </div>
              </>
            )}

            {/* Wait */}
            {nodeType === "wait" && (
              <div>
                <label className={labelCls}>Duration (ms, max 300 000)</label>
                <input className={inputCls} type="number" min="0" max="300000" value={local.duration || "1000"} onChange={(e) => patch({ duration: e.target.value })} />
              </div>
            )}

            {/* Filter */}
            {nodeType === "filter" && (
              <>
                <div>
                  <label className={labelCls}>Array Field Name</label>
                  <input className={inputCls} value={local.arrayKey || ""} onChange={(e) => patch({ arrayKey: e.target.value })} placeholder="items" />
                </div>
                <div>
                  <label className={labelCls}>Keep condition (JS — use `item` or `$input`)</label>
                  <textarea className={inputCls + " font-mono resize-none"} rows={3} value={local.condition || ""} onChange={(e) => patch({ condition: e.target.value })} placeholder="item.active === true" />
                </div>
              </>
            )}

            {/* Switch */}
            {nodeType === "switch" && (
              <>
                <div>
                  <label className={labelCls}>Value Field (dot path from $input)</label>
                  <input className={inputCls} value={local.field || ""} onChange={(e) => patch({ field: e.target.value })} placeholder="status" />
                </div>
                <div>
                  <label className={labelCls}>Cases → output handle name</label>
                  <div className="space-y-2">
                    {cases.map((c, i) => (
                      <div key={i} className="flex gap-1">
                        <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="value" value={c.value} onChange={(e) => { const n = [...cases]; n[i] = { ...n[i], value: e.target.value }; patch({ cases: n }); }} />
                        <input className="w-24 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="output" value={c.output} onChange={(e) => { const n = [...cases]; n[i] = { ...n[i], output: e.target.value }; patch({ cases: n }); }} />
                        <button onClick={() => patch({ cases: cases.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-400 px-1">×</button>
                      </div>
                    ))}
                    <button onClick={() => patch({ cases: [...cases, { value: "", output: "" }] })} className="text-blue-400 text-xs hover:underline">+ Add case</button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Default output handle</label>
                  <input className={inputCls} value={local.defaultOutput || "default"} onChange={(e) => patch({ defaultOutput: e.target.value })} placeholder="default" />
                </div>
              </>
            )}

            {/* Email */}
            {nodeType === "email" && (
              <>
                <div>
                  <label className={labelCls}>SMTP Host</label>
                  <input className={inputCls} value={local.smtpHost || ""} onChange={(e) => patch({ smtpHost: e.target.value })} placeholder="smtp.example.com" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>Port</label>
                    <input className={inputCls} type="number" value={local.smtpPort || "587"} onChange={(e) => patch({ smtpPort: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>SMTP User</label>
                  <input className={inputCls} value={local.smtpUser || ""} onChange={(e) => patch({ smtpUser: e.target.value })} placeholder="user@example.com" />
                </div>
                <div>
                  <label className={labelCls}>SMTP Password</label>
                  <input className={inputCls} type="password" value={local.smtpPass || ""} onChange={(e) => patch({ smtpPass: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>From</label>
                  <input className={inputCls} value={local.from || ""} onChange={(e) => patch({ from: e.target.value })} placeholder="sender@example.com" />
                </div>
                <div>
                  <label className={labelCls}>To (supports {`{{$input.email}}`})</label>
                  <input className={inputCls} value={local.to || ""} onChange={(e) => patch({ to: e.target.value })} placeholder="{{$input.email}}" />
                </div>
                <div>
                  <label className={labelCls}>Subject</label>
                  <input className={inputCls} value={local.subject || ""} onChange={(e) => patch({ subject: e.target.value })} placeholder="Hello {{$input.name}}" />
                </div>
                <div>
                  <label className={labelCls}>Body</label>
                  <textarea className={inputCls + " resize-none"} rows={4} value={local.body || ""} onChange={(e) => patch({ body: e.target.value })} placeholder="Hi {{$input.name}}, ..." />
                </div>
              </>
            )}

            {/* Sub-workflow */}
            {nodeType === "subWorkflow" && (
              <div>
                <label className={labelCls}>Target Workflow ID</label>
                <input className={inputCls + " font-mono"} value={local.targetWorkflowId || ""} onChange={(e) => patch({ targetWorkflowId: e.target.value })} placeholder="workflow-id" />
                <p className="text-xs text-gray-500 mt-1">Fires the target workflow asynchronously with $input as trigger data</p>
              </div>
            )}

            {/* Respond to Webhook */}
            {nodeType === "respond" && (
              <>
                <div>
                  <label className={labelCls}>Status Code</label>
                  <input className={inputCls} type="number" value={local.statusCode || "200"} onChange={(e) => patch({ statusCode: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Response Body (JSON, supports {`{{$input.field}}`})</label>
                  <textarea className={inputCls + " font-mono resize-none"} rows={4} value={local.responseBody || ""} onChange={(e) => patch({ responseBody: e.target.value })} placeholder={'{"ok": true, "id": "{{$input.id}}"}'} />
                  <p className="text-xs text-gray-500 mt-1">Leave blank to echo $input as-is</p>
                </div>
              </>
            )}

            {/* Memory Read / Write */}
            {(nodeType === "memoryRead" || nodeType === "memoryWrite") && (
              <>
                <div>
                  <label className={labelCls}>Memory Key</label>
                  <input className={inputCls} value={(local.key as string) || ""} onChange={(e) => patch({ key: e.target.value })} placeholder="my_key" />
                </div>
                <div>
                  <label className={labelCls}>Scope (workflow ID or leave blank for global)</label>
                  <input className={inputCls} value={(local.workflowId as string) || ""} onChange={(e) => patch({ workflowId: e.target.value })} placeholder="(optional)" />
                </div>
              </>
            )}

            <button onClick={() => onUpdate(local)} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition">
              Apply
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
