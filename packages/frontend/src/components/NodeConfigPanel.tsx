import { useEffect, useState } from "react";
import type { Node } from "reactflow";
import api from "../api/client";
import { ExpressionInput } from "./ExpressionInput";

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
  syncResponse?: boolean;
  queryParams?: Array<{ key: string; value: string }>;
  customHeaders?: Array<{ key: string; value: string }>;
  timeout?: string;
  contentType?: string;
  formFields?: Array<{ key: string; value: string }>;
  outputKey?: string;
  flatten?: boolean;
  keepInput?: boolean;
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  maxTokens?: string;
  temperature?: string;
  baseUrl?: string;
  text?: string;
  // DateTime node
  operation?: string;
  inputField?: string;
  compareField?: string;
  outputField?: string;
  format?: string;
  unit?: string;
  amount?: string;
  // Crypto node
  secretKey?: string;
  encoding?: string;
  // Pinned data
  _pinnedData?: string;
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
  const queryParams = local.queryParams || [];
  const customHeaders = local.customHeaders || [];
  const formFields = local.formFields || [];

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
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!local.syncResponse}
                    onChange={(e) => patch({ syncResponse: e.target.checked })}
                    className="accent-purple-500"
                  />
                  <span className="text-gray-300 text-xs">Sync response (hold HTTP until workflow finishes)</span>
                </label>
                <div className="mt-3">
                  <label className={labelCls}>Authentication</label>
                  <select className={inputCls} value={(local.authType as string) || "none"} onChange={(e) => patch({ authType: e.target.value })}>
                    <option value="none">None</option>
                    <option value="apikey">API Key (header)</option>
                    <option value="basic">Basic Auth (user:pass)</option>
                    <option value="bearer">Bearer Token</option>
                  </select>
                </div>
                {local.authType === "apikey" && (
                  <div className="mt-2">
                    <label className={labelCls}>Header Name</label>
                    <input className={inputCls} value={(local.authHeaderName as string) || "X-API-Key"} onChange={(e) => patch({ authHeaderName: e.target.value })} placeholder="X-API-Key" />
                  </div>
                )}
                {local.authType && local.authType !== "none" && (
                  <div className="mt-2">
                    <label className={labelCls}>{local.authType === "basic" ? "user:password" : "Secret Value"}</label>
                    <input className={inputCls} type="password" value={(local.authValue as string) || ""} onChange={(e) => patch({ authValue: e.target.value })} placeholder={local.authType === "basic" ? "username:password" : "secret"} />
                  </div>
                )}
              </div>
            )}

            {/* Manual Trigger */}
            {nodeType === "manualTrigger" && (
              <div>
                <label className={labelCls}>Test Data (JSON)</label>
                <textarea
                  className={inputCls + " resize-none font-mono text-xs"}
                  rows={5}
                  value={(local.testData as string) || ""}
                  onChange={(e) => patch({ testData: e.target.value })}
                  placeholder={'{\n  "key": "value"\n}'}
                />
                <p className="text-xs text-gray-500 mt-1">Sent as trigger data when the workflow is executed manually.</p>
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
                  <label className={labelCls}>Content Type</label>
                  <select className={inputCls} value={local.contentType || "json"} onChange={(e) => patch({ contentType: e.target.value })}>
                    <option value="json">JSON body</option>
                    <option value="form">multipart/form-data</option>
                    <option value="urlencoded">application/x-www-form-urlencoded</option>
                    <option value="raw">Raw text body</option>
                  </select>
                </div>
                {(local.contentType === "form" || local.contentType === "urlencoded") ? (
                  <div>
                    <label className={labelCls}>Form Fields</label>
                    <div className="space-y-1">
                      {formFields.map((f, i) => (
                        <div key={i} className="flex gap-1">
                          <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="field" value={f.key} onChange={(e) => { const n = [...formFields]; n[i] = { ...n[i], key: e.target.value }; patch({ formFields: n }); }} />
                          <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="{{$input.value}}" value={f.value} onChange={(e) => { const n = [...formFields]; n[i] = { ...n[i], value: e.target.value }; patch({ formFields: n }); }} />
                          <button onClick={() => patch({ formFields: formFields.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-400 px-1">×</button>
                        </div>
                      ))}
                      <button onClick={() => patch({ formFields: [...formFields, { key: "", value: "" }] })} className="text-blue-400 text-xs hover:underline">+ Add field</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}>Body (JSON — use {`{{$input.field}}`})</label>
                    <ExpressionInput multiline value={local.body || ""} onChange={(v) => patch({ body: v })} placeholder={'{"key": "{{$input.value}}"}'} className={inputCls + " font-mono resize-none"} />
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>Timeout (ms)</label>
                    <input className={inputCls} type="number" min="1000" max="300000" value={local.timeout || "30000"} onChange={(e) => patch({ timeout: e.target.value })} />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Retries</label>
                    <input className={inputCls} type="number" min="0" max="10" value={(local.retryCount as string) || "0"} onChange={(e) => patch({ retryCount: e.target.value })} />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Retry delay (ms)</label>
                    <input className={inputCls} type="number" min="100" value={(local.retryDelay as string) || "1000"} onChange={(e) => patch({ retryDelay: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Query Params</label>
                  <div className="space-y-1">
                    {queryParams.map((p, i) => (
                      <div key={i} className="flex gap-1">
                        <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="key" value={p.key} onChange={(e) => { const n = [...queryParams]; n[i] = { ...n[i], key: e.target.value }; patch({ queryParams: n }); }} />
                        <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="{{$input.value}}" value={p.value} onChange={(e) => { const n = [...queryParams]; n[i] = { ...n[i], value: e.target.value }; patch({ queryParams: n }); }} />
                        <button onClick={() => patch({ queryParams: queryParams.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-400 px-1">×</button>
                      </div>
                    ))}
                    <button onClick={() => patch({ queryParams: [...queryParams, { key: "", value: "" }] })} className="text-blue-400 text-xs hover:underline">+ Add param</button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Custom Headers</label>
                  <div className="space-y-1">
                    {customHeaders.map((h, i) => (
                      <div key={i} className="flex gap-1">
                        <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="Header-Name" value={h.key} onChange={(e) => { const n = [...customHeaders]; n[i] = { ...n[i], key: e.target.value }; patch({ customHeaders: n }); }} />
                        <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="value" value={h.value} onChange={(e) => { const n = [...customHeaders]; n[i] = { ...n[i], value: e.target.value }; patch({ customHeaders: n }); }} />
                        <button onClick={() => patch({ customHeaders: customHeaders.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-400 px-1">×</button>
                      </div>
                    ))}
                    <button onClick={() => patch({ customHeaders: [...customHeaders, { key: "", value: "" }] })} className="text-blue-400 text-xs hover:underline">+ Add header</button>
                  </div>
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
                  <ExpressionInput value={local.to || ""} onChange={(v) => patch({ to: v })} placeholder="{{$input.email}}" />
                </div>
                <div>
                  <label className={labelCls}>Subject</label>
                  <ExpressionInput value={local.subject || ""} onChange={(v) => patch({ subject: v })} placeholder="Hello {{$input.name}}" />
                </div>
                <div>
                  <label className={labelCls}>Body</label>
                  <ExpressionInput multiline value={local.body || ""} onChange={(v) => patch({ body: v })} placeholder="Hi {{$input.name}}, ..." className={inputCls + " resize-none"} />
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
                  <ExpressionInput multiline value={local.responseBody || ""} onChange={(v) => patch({ responseBody: v })} placeholder={'{"ok": true, "id": "{{$input.id}}"}'} className={inputCls + " font-mono resize-none"} />
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

            {/* AI / LLM */}
            {nodeType === "ai" && (
              <>
                <div>
                  <label className={labelCls}>Model</label>
                  <input className={inputCls} value={local.model || "claude-haiku-4-5-20251001"} onChange={(e) => patch({ model: e.target.value })} placeholder="claude-haiku-4-5-20251001" />
                </div>
                <div>
                  <label className={labelCls}>System Prompt (supports {`{{$input.field}}`})</label>
                  <ExpressionInput multiline value={local.systemPrompt || ""} onChange={(v) => patch({ systemPrompt: v })} placeholder="You are a helpful assistant." className={inputCls + " resize-none"} />
                </div>
                <div>
                  <label className={labelCls}>User Prompt (supports {`{{$input.field}}`})</label>
                  <ExpressionInput multiline value={local.userPrompt || ""} onChange={(v) => patch({ userPrompt: v })} placeholder="Summarize this: {{$input.text}}" className={inputCls + " resize-none"} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>Max Tokens</label>
                    <input className={inputCls} type="number" min="1" max="8096" value={local.maxTokens || "1024"} onChange={(e) => patch({ maxTokens: e.target.value })} />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Temperature</label>
                    <input className={inputCls} type="number" min="0" max="1" step="0.1" value={local.temperature ?? "1"} onChange={(e) => patch({ temperature: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>API Key (or set ANTHROPIC_API_KEY env)</label>
                  <input className={inputCls} type="password" value={local.apiKey || ""} onChange={(e) => patch({ apiKey: e.target.value })} placeholder="sk-ant-..." />
                </div>
                <div>
                  <label className={labelCls}>Base URL (optional, default: Anthropic)</label>
                  <input className={inputCls} value={local.baseUrl || ""} onChange={(e) => patch({ baseUrl: e.target.value })} placeholder="https://api.anthropic.com" />
                </div>
                <p className="text-xs text-gray-500">Output: aiText, aiResult (JSON-parsed if valid), aiModel, aiUsage</p>
              </>
            )}

            {/* Aggregate */}
            {nodeType === "aggregate" && (
              <>
                <div>
                  <label className={labelCls}>Input Array Field (default: items)</label>
                  <input className={inputCls} value={local.arrayKey || ""} onChange={(e) => patch({ arrayKey: e.target.value })} placeholder="items" />
                </div>
                <div>
                  <label className={labelCls}>Output Field Name (default: results)</label>
                  <input className={inputCls} value={(local.outputKey as string) || ""} onChange={(e) => patch({ outputKey: e.target.value })} placeholder="results" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!local.flatten} onChange={(e) => patch({ flatten: e.target.checked })} className="accent-blue-500" />
                  <span className="text-gray-300 text-xs">Flatten one level (for arrays of arrays)</span>
                </label>
                <p className="text-xs text-gray-500">Also outputs `count` with the number of items.</p>
              </>
            )}

            {/* Transform */}
            {nodeType === "transform" && (
              <>
                <div>
                  <label className={labelCls}>Field Mappings (output key → expression)</label>
                  <div className="space-y-2">
                    {mappings.map((m, i) => (
                      <div key={i} className="flex gap-1">
                        <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="output.key" value={m.key} onChange={(e) => { const n = [...mappings]; n[i] = { ...n[i], key: e.target.value }; patch({ mappings: n }); }} />
                        <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="{{$input.field}}" value={m.value} onChange={(e) => { const n = [...mappings]; n[i] = { ...n[i], value: e.target.value }; patch({ mappings: n }); }} />
                        <button onClick={() => patch({ mappings: mappings.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-400 px-1">×</button>
                      </div>
                    ))}
                    <button onClick={() => patch({ mappings: [...mappings, { key: "", value: "" }] })} className="text-blue-400 text-xs hover:underline">+ Add mapping</button>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!local.keepInput} onChange={(e) => patch({ keepInput: e.target.checked })} className="accent-blue-500" />
                  <span className="text-gray-300 text-xs">Keep $input fields in output (extend mode)</span>
                </label>
                <p className="text-xs text-gray-500">Dot-path keys build nested objects: user.name → {`{ user: { name: ... } }`}</p>
              </>
            )}

            {/* Sticky Note */}
            {nodeType === "stickyNote" && (
              <div>
                <label className={labelCls}>Note Text</label>
                <textarea className={inputCls + " resize-none"} rows={6} value={(local.text as string) || ""} onChange={(e) => patch({ text: e.target.value })} placeholder="Add a note to describe this part of the workflow..." />
              </div>
            )}

            {/* Date & Time */}
            {nodeType === "datetime" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Operation</label>
                  <select className={inputCls} value={local.operation || "now"} onChange={(e) => patch({ operation: e.target.value })}>
                    <option value="now">Now</option>
                    <option value="format">Format</option>
                    <option value="add">Add</option>
                    <option value="subtract">Subtract</option>
                    <option value="diff">Difference</option>
                    <option value="startOf">Start Of</option>
                    <option value="endOf">End Of</option>
                    <option value="isAfter">Is After</option>
                    <option value="isBefore">Is Before</option>
                  </select>
                </div>
                {local.operation !== "now" && (
                  <div>
                    <label className={labelCls}>Input Date</label>
                    <ExpressionInput value={local.inputField || ""} onChange={(v) => patch({ inputField: v })} placeholder="{{body.date}} or 2024-01-01" />
                  </div>
                )}
                {(local.operation === "diff" || local.operation === "isAfter" || local.operation === "isBefore") && (
                  <div>
                    <label className={labelCls}>Compare Date</label>
                    <ExpressionInput value={local.compareField || ""} onChange={(v) => patch({ compareField: v })} placeholder="{{body.endDate}}" />
                  </div>
                )}
                {(local.operation === "add" || local.operation === "subtract" || local.operation === "diff" || local.operation === "startOf" || local.operation === "endOf") && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className={labelCls}>Amount</label>
                      <input className={inputCls} type="number" value={local.amount || "1"} onChange={(e) => patch({ amount: e.target.value })} />
                    </div>
                    <div className="flex-1">
                      <label className={labelCls}>Unit</label>
                      <select className={inputCls} value={local.unit || "days"} onChange={(e) => patch({ unit: e.target.value })}>
                        <option value="seconds">Seconds</option>
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="month">Month</option>
                        <option value="year">Year</option>
                      </select>
                    </div>
                  </div>
                )}
                <div>
                  <label className={labelCls}>Output Format</label>
                  <select className={inputCls} value={local.format || "iso"} onChange={(e) => patch({ format: e.target.value })}>
                    <option value="iso">ISO 8601</option>
                    <option value="date">Date only (YYYY-MM-DD)</option>
                    <option value="time">Time only (HH:MM:SS)</option>
                    <option value="unix">Unix timestamp (s)</option>
                    <option value="unix_ms">Unix timestamp (ms)</option>
                    <option value="local">Local string</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Output Field</label>
                  <input className={inputCls} value={local.outputField || "datetime"} onChange={(e) => patch({ outputField: e.target.value })} placeholder="datetime" />
                </div>
              </div>
            )}

            {/* Crypto / Hash */}
            {nodeType === "crypto" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Operation</label>
                  <select className={inputCls} value={local.operation || "sha256"} onChange={(e) => patch({ operation: e.target.value })}>
                    <option value="md5">MD5</option>
                    <option value="sha1">SHA-1</option>
                    <option value="sha256">SHA-256</option>
                    <option value="sha512">SHA-512</option>
                    <option value="hmac_sha256">HMAC-SHA256</option>
                    <option value="hmac_sha512">HMAC-SHA512</option>
                    <option value="base64encode">Base64 Encode</option>
                    <option value="base64decode">Base64 Decode</option>
                    <option value="urlencode">URL Encode</option>
                    <option value="urldecode">URL Decode</option>
                    <option value="uuid">Generate UUID</option>
                  </select>
                </div>
                {local.operation !== "uuid" && (
                  <div>
                    <label className={labelCls}>Input Value</label>
                    <ExpressionInput value={local.inputField || ""} onChange={(v) => patch({ inputField: v })} placeholder="{{body.text}}" />
                  </div>
                )}
                {(local.operation === "hmac_sha256" || local.operation === "hmac_sha512") && (
                  <div>
                    <label className={labelCls}>Secret Key</label>
                    <input className={inputCls} type="password" value={local.secretKey || ""} onChange={(e) => patch({ secretKey: e.target.value })} placeholder="HMAC secret" />
                  </div>
                )}
                {(local.operation?.startsWith("sha") || local.operation?.startsWith("hmac") || local.operation === "md5") && (
                  <div>
                    <label className={labelCls}>Encoding</label>
                    <select className={inputCls} value={local.encoding || "hex"} onChange={(e) => patch({ encoding: e.target.value })}>
                      <option value="hex">Hex</option>
                      <option value="base64">Base64</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelCls}>Output Field</label>
                  <input className={inputCls} value={local.outputField || "result"} onChange={(e) => patch({ outputField: e.target.value })} placeholder="result" />
                </div>
              </div>
            )}

            {/* Pinned Data — available on all non-trigger nodes */}
            {nodeType !== "webhookTrigger" && nodeType !== "manualTrigger" && nodeType !== "scheduleTrigger" && nodeType !== "stickyNote" && (
              <div className="border-t border-gray-700 pt-3 space-y-1">
                <label className={labelCls + " flex items-center gap-1"}>
                  📌 Pinned Data
                  <span className="text-gray-400 font-normal">(overrides execution)</span>
                </label>
                <textarea
                  className={inputCls + " resize-none font-mono text-xs"}
                  rows={4}
                  value={(local._pinnedData as string) || ""}
                  onChange={(e) => patch({ _pinnedData: e.target.value || undefined })}
                  placeholder={'{\n  "key": "value"\n}'}
                />
                <p className="text-xs text-gray-500">When set, this node returns this JSON instead of executing — useful for mocking during test runs.</p>
              </div>
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
