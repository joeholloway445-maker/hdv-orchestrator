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
  // Merge node
  mergeMode?: string;
  keyField?: string;
  // IF branch structured conditions
  conditions?: Array<{ field: string; operator: string; value: string }>;
  combineMode?: string;
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
  inputSuggestions?: string[];
  workflowId?: string;
}

interface FieldRule {
  field: string;
  type?: string;
  required?: boolean;
  minLength?: string;
  maxLength?: string;
  pattern?: string;
  min?: string;
  max?: string;
}

function ValidateConfig({
  local,
  patch,
  inputCls,
  labelCls,
}: {
  local: NodeData;
  patch: (p: Partial<NodeData>) => void;
  inputCls: string;
  labelCls: string;
}) {
  const rules = ((local.rules as FieldRule[]) || []);

  function patchRules(next: FieldRule[]) {
    patch({ rules: next } as Partial<NodeData>);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Mode</label>
        <select className={inputCls} value={(local.mode as string) || "throw"} onChange={(e) => patch({ mode: e.target.value } as Partial<NodeData>)}>
          <option value="throw">Throw (routes to error branch)</option>
          <option value="flag">Flag (outputs _validationErrors)</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Validation Rules</label>
        <div className="space-y-3">
          {rules.map((rule, i) => (
            <div key={i} className="bg-gray-700/60 rounded-lg p-2 space-y-2">
              <div className="flex gap-1 items-center">
                <input
                  className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none"
                  placeholder="field.path"
                  value={rule.field}
                  onChange={(e) => { const n = [...rules]; n[i] = { ...n[i], field: e.target.value }; patchRules(n); }}
                />
                <button onClick={() => patchRules(rules.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400 px-1 text-sm">×</button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={labelCls}>Type</label>
                  <select className={inputCls} value={rule.type || "any"} onChange={(e) => { const n = [...rules]; n[i] = { ...n[i], type: e.target.value }; patchRules(n); }}>
                    <option value="any">Any</option>
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="array">Array</option>
                    <option value="object">Object</option>
                    <option value="null">Null</option>
                  </select>
                </div>
                <label className="flex items-center gap-1 mt-4 cursor-pointer">
                  <input type="checkbox" checked={!!rule.required} onChange={(e) => { const n = [...rules]; n[i] = { ...n[i], required: e.target.checked }; patchRules(n); }} className="accent-blue-500" />
                  <span className="text-gray-300 text-xs">Required</span>
                </label>
              </div>
              {(rule.type === "string" || !rule.type || rule.type === "any") && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>Min Length</label>
                    <input className={inputCls} type="number" min="0" value={rule.minLength || ""} onChange={(e) => { const n = [...rules]; n[i] = { ...n[i], minLength: e.target.value }; patchRules(n); }} placeholder="—" />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Max Length</label>
                    <input className={inputCls} type="number" min="0" value={rule.maxLength || ""} onChange={(e) => { const n = [...rules]; n[i] = { ...n[i], maxLength: e.target.value }; patchRules(n); }} placeholder="—" />
                  </div>
                </div>
              )}
              {(rule.type === "string" || !rule.type || rule.type === "any") && (
                <div>
                  <label className={labelCls}>Pattern (regex)</label>
                  <input className={inputCls + " font-mono"} value={rule.pattern || ""} onChange={(e) => { const n = [...rules]; n[i] = { ...n[i], pattern: e.target.value }; patchRules(n); }} placeholder="^[a-z]+$" />
                </div>
              )}
              {(rule.type === "number" || rule.type === "any") && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>Min</label>
                    <input className={inputCls} type="number" value={rule.min ?? ""} onChange={(e) => { const n = [...rules]; n[i] = { ...n[i], min: e.target.value }; patchRules(n); }} placeholder="—" />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Max</label>
                    <input className={inputCls} type="number" value={rule.max ?? ""} onChange={(e) => { const n = [...rules]; n[i] = { ...n[i], max: e.target.value }; patchRules(n); }} placeholder="—" />
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={() => patchRules([...rules, { field: "" }])} className="text-blue-400 text-xs hover:underline">+ Add rule</button>
        </div>
      </div>
    </div>
  );
}

export function NodeConfigPanel({
  node,
  onUpdate,
  onClose,
  webhookBaseUrl = "http://localhost:4000",
  nodeLog,
  inputSuggestions,
  workflowId,
}: Props) {
  const [local, setLocal] = useState<NodeData>(node.data);
  const [tab, setTab] = useState<"config" | "output" | "test">("config");
  const [testInput, setTestInput] = useState("{}");
  const [testOutput, setTestOutput] = useState<unknown>(undefined);
  const [testError, setTestError] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);

  useEffect(() => {
    setLocal(node.data);
    setTab("config");
    setTestOutput(undefined);
    setTestError(null);
    setTestInput(nodeLog?.input ? JSON.stringify(nodeLog.input, null, 2) : "{}");
  }, [node.id]);

  useEffect(() => {
    if (nodeLog) {
      setTab("output");
      if (nodeLog.input) setTestInput(JSON.stringify(nodeLog.input, null, 2));
    }
  }, [nodeLog]);

  useEffect(() => {
    api.get("/credentials").then(({ data }) => setCredentials(data as Credential[])).catch(() => {});
  }, []);

  const nodeType = local.nodeType;

  function patch(partial: Partial<NodeData>) {
    setLocal((prev) => ({ ...prev, ...partial }));
  }

  async function runTest() {
    if (!workflowId) return;
    setTestLoading(true);
    setTestOutput(undefined);
    setTestError(null);
    try {
      let parsedInput: Record<string, unknown> = {};
      try { parsedInput = JSON.parse(testInput); } catch { setTestError("Invalid JSON input"); setTestLoading(false); return; }
      const { data } = await api.post(`/workflows/${workflowId}/test-node`, { nodeId: node.id, input: parsedInput });
      if (data.error) setTestError(data.error);
      else setTestOutput(data.output);
    } catch (e: unknown) {
      setTestError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setTestLoading(false);
    }
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

      <div className="flex border-b border-gray-700">
        {(["config", ...(nodeLog ? ["output"] : []), ...(workflowId ? ["test"] : [])] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as "config" | "output" | "test")}
            className={`flex-1 py-2 text-xs font-medium capitalize transition ${
              tab === t ? "text-white border-b-2 border-blue-500" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === "test" && workflowId ? (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Input JSON</label>
              <textarea
                className={inputCls + " resize-none font-mono text-xs"}
                rows={8}
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder={'{\n  "body": { "email": "test@example.com" }\n}'}
              />
              <p className="text-xs text-gray-500 mt-1">Simulates the $input received by this node.</p>
            </div>
            <button
              onClick={runTest}
              disabled={testLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition"
            >
              {testLoading ? "Running…" : "▶ Run Test"}
            </button>
            {testError && (
              <div>
                <label className={labelCls + " !text-red-400"}>Error</label>
                <pre className="bg-gray-900 text-red-300 rounded-lg p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap">{testError}</pre>
              </div>
            )}
            {testOutput !== undefined && (
              <div>
                <label className={labelCls + " !text-green-400"}>Output</label>
                <pre className="bg-gray-900 text-green-300 rounded-lg p-3 text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                  {JSON.stringify(testOutput, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : tab === "output" && nodeLog ? (
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
                  <div className="mt-1">
                    <p className="text-xs text-gray-500 font-mono break-all">{webhookBaseUrl}/webhooks/trigger/{local.webhookId}</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(`${webhookBaseUrl}/webhooks/trigger/${local.webhookId}`)}
                      className="text-xs text-blue-400 hover:underline mt-0.5"
                    >
                      Copy URL
                    </button>
                  </div>
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
              <div className="space-y-2">
                <label className={labelCls}>Cron Expression</label>
                <input className={inputCls + " font-mono"} value={local.cronExpression || ""} onChange={(e) => patch({ cronExpression: e.target.value })} placeholder="*/5 * * * *" />
                <p className="text-xs text-gray-500">min hour day month weekday (UTC) · Workflow must be Active</p>
                <div>
                  <label className={labelCls}>Timezone (IANA, e.g. America/New_York)</label>
                  <input className={inputCls + " font-mono"} value={(local.timezone as string) || ""} onChange={(e) => patch({ timezone: e.target.value || undefined })} placeholder="UTC" />
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {[
                    { label: "Every minute", value: "* * * * *" },
                    { label: "Every 5 min", value: "*/5 * * * *" },
                    { label: "Every hour", value: "0 * * * *" },
                    { label: "Daily midnight", value: "0 0 * * *" },
                    { label: "Weekdays 9am", value: "0 9 * * 1-5" },
                    { label: "Weekly Mon", value: "0 0 * * 1" },
                  ].map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition"
                      onClick={() => patch({ cronExpression: p.value })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
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
                  <ExpressionInput value={local.url || ""} onChange={(v) => patch({ url: v })} placeholder="https://api.example.com/{{$input.id}}" suggestions={inputSuggestions} />
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
                        <div key={i} className="flex gap-1 items-center">
                          <input className="w-28 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="field" value={f.key} onChange={(e) => { const n = [...formFields]; n[i] = { ...n[i], key: e.target.value }; patch({ formFields: n }); }} />
                          <ExpressionInput className="flex-1" placeholder="{{$input.value}}" value={f.value} onChange={(v) => { const n = [...formFields]; n[i] = { ...n[i], value: v }; patch({ formFields: n }); }} suggestions={inputSuggestions} />
                          <button onClick={() => patch({ formFields: formFields.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-400 px-1">×</button>
                        </div>
                      ))}
                      <button onClick={() => patch({ formFields: [...formFields, { key: "", value: "" }] })} className="text-blue-400 text-xs hover:underline">+ Add field</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}>Body (JSON — use {`{{$input.field}}`})</label>
                    <ExpressionInput multiline value={local.body || ""} onChange={(v) => patch({ body: v })} placeholder={'{"key": "{{$input.value}}"}'} className={inputCls + " font-mono resize-none"} suggestions={inputSuggestions} />
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

            {/* Merge */}
            {nodeType === "merge" && (
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Merge Mode</label>
                  <select className={inputCls} value={(local.mergeMode as string) || "combine"} onChange={(e) => patch({ mergeMode: e.target.value })}>
                    <option value="combine">Combine — array of all inputs</option>
                    <option value="passThrough">Pass Through — last input only</option>
                    <option value="zip">Zip — pair items by index</option>
                    <option value="mergeByKey">Merge By Key — deep-merge on key field</option>
                  </select>
                </div>
                {(local.mergeMode as string) === "mergeByKey" && (
                  <div>
                    <label className={labelCls}>Key Field</label>
                    <input className={inputCls} value={(local.keyField as string) || "id"} onChange={(e) => patch({ keyField: e.target.value })} placeholder="id" />
                  </div>
                )}
                <p className="text-xs text-gray-500">Connect multiple nodes into this merge node. The selected mode controls how their outputs are combined.</p>
              </div>
            )}

            {/* IF Branch */}
            {nodeType === "ifBranch" && (() => {
              const conditions: Array<{ field: string; operator: string; value: string }> = (local.conditions as Array<{ field: string; operator: string; value: string }>) || [];
              const useStructured = conditions.length > 0 || !local.condition;
              const OPERATORS = [
                { v: "equals", l: "= equals" },
                { v: "notEquals", l: "≠ not equals" },
                { v: "contains", l: "contains" },
                { v: "notContains", l: "does not contain" },
                { v: "startsWith", l: "starts with" },
                { v: "endsWith", l: "ends with" },
                { v: "gt", l: "> greater than" },
                { v: "lt", l: "< less than" },
                { v: "gte", l: "≥ ≥" },
                { v: "lte", l: "≤ ≤" },
                { v: "exists", l: "exists" },
                { v: "notExists", l: "does not exist" },
                { v: "isTrue", l: "is true" },
                { v: "isFalse", l: "is false" },
                { v: "isEmpty", l: "is empty" },
                { v: "isNotEmpty", l: "is not empty" },
              ];
              const noValueOps = new Set(["exists", "notExists", "isTrue", "isFalse", "isEmpty", "isNotEmpty"]);
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className={labelCls}>Conditions</label>
                    <div className="flex gap-1">
                      <button onClick={() => patch({ conditions: [...conditions, { field: "", operator: "equals", value: "" }], condition: "" })} className="text-blue-400 text-xs hover:underline">+ Add</button>
                      {conditions.length === 0 && <button onClick={() => patch({ condition: local.condition || "$input.status === 'active'", conditions: [] })} className="text-gray-400 text-xs hover:underline ml-2">JS mode</button>}
                    </div>
                  </div>
                  {useStructured ? (
                    <>
                      {conditions.length > 1 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">Combine:</span>
                          <select className="bg-gray-700 text-white text-xs rounded px-2 py-1" value={local.combineMode || "AND"} onChange={(e) => patch({ combineMode: e.target.value })}>
                            <option value="AND">AND (all must pass)</option>
                            <option value="OR">OR (any must pass)</option>
                          </select>
                        </div>
                      )}
                      <div className="space-y-2">
                        {conditions.map((c, i) => (
                          <div key={i} className="bg-gray-750 rounded p-2 space-y-1 border border-gray-600">
                            <div className="flex gap-1 items-center">
                              <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs" placeholder="field (e.g. status)" value={c.field} onChange={(e) => { const n = [...conditions]; n[i] = { ...n[i], field: e.target.value }; patch({ conditions: n }); }} />
                              <button onClick={() => patch({ conditions: conditions.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-400 text-xs px-1">×</button>
                            </div>
                            <select className="w-full bg-gray-700 text-white rounded px-2 py-1 text-xs" value={c.operator} onChange={(e) => { const n = [...conditions]; n[i] = { ...n[i], operator: e.target.value }; patch({ conditions: n }); }}>
                              {OPERATORS.map((op) => <option key={op.v} value={op.v}>{op.l}</option>)}
                            </select>
                            {!noValueOps.has(c.operator) && (
                              <input className="w-full bg-gray-700 text-white rounded px-2 py-1 text-xs" placeholder="value or {{$input.field}}" value={c.value} onChange={(e) => { const n = [...conditions]; n[i] = { ...n[i], value: e.target.value }; patch({ conditions: n }); }} />
                            )}
                          </div>
                        ))}
                        {conditions.length === 0 && (
                          <p className="text-xs text-gray-500">Click "+ Add" to add a condition, or use JS mode for raw expressions.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div>
                      <textarea className={inputCls + " font-mono resize-none"} rows={3} value={local.condition || ""} onChange={(e) => patch({ condition: e.target.value })} placeholder="$input.status === 'active'" />
                      <button onClick={() => patch({ conditions: [{ field: "", operator: "equals", value: "" }], condition: "" })} className="text-blue-400 text-xs hover:underline mt-1">Switch to structured</button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">✓ handle = true · ✗ handle = false</p>
                </div>
              );
            })()}

            {/* Set */}
            {nodeType === "set" && (
              <div>
                <label className={labelCls}>Field Mappings</label>
                <div className="space-y-2">
                  {mappings.map((m, i) => (
                    <div key={i} className="flex gap-1 items-center">
                      <input className="w-28 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="key" value={m.key} onChange={(e) => { const n = [...mappings]; n[i] = { ...n[i], key: e.target.value }; patch({ mappings: n }); }} />
                      <ExpressionInput className="flex-1" placeholder="{{$input.field}}" value={m.value} onChange={(v) => { const n = [...mappings]; n[i] = { ...n[i], value: v }; patch({ mappings: n }); }} suggestions={inputSuggestions} />
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
                      <div key={i} className="flex gap-1 items-center">
                        <input className="w-28 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="key" value={m.key} onChange={(e) => { const n = [...mappings]; n[i] = { ...n[i], key: e.target.value }; patch({ mappings: n }); }} />
                        <ExpressionInput className="flex-1" placeholder="{{item.field}}" value={m.value} onChange={(v) => { const n = [...mappings]; n[i] = { ...n[i], value: v }; patch({ mappings: n }); }} suggestions={inputSuggestions} />
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
            {nodeType === "filter" && (() => {
              const filterConds: Array<{ field: string; operator: string; value: string }> = (local.conditions as Array<{ field: string; operator: string; value: string }>) || [];
              const useStructured = filterConds.length > 0 || !local.condition;
              const FILTER_OPS = [
                { v: "equals", l: "= equals" }, { v: "notEquals", l: "≠ not equals" },
                { v: "contains", l: "contains" }, { v: "notContains", l: "does not contain" },
                { v: "startsWith", l: "starts with" }, { v: "endsWith", l: "ends with" },
                { v: "gt", l: "> greater than" }, { v: "lt", l: "< less than" },
                { v: "gte", l: "≥ ≥" }, { v: "lte", l: "≤ ≤" },
                { v: "exists", l: "exists" }, { v: "notExists", l: "does not exist" },
                { v: "isTrue", l: "is true" }, { v: "isFalse", l: "is false" },
                { v: "isEmpty", l: "is empty" }, { v: "isNotEmpty", l: "is not empty" },
              ];
              const noValueOps = new Set(["exists", "notExists", "isTrue", "isFalse", "isEmpty", "isNotEmpty"]);
              return (
                <>
                  <div>
                    <label className={labelCls}>Array Field Name</label>
                    <input className={inputCls} value={local.arrayKey || ""} onChange={(e) => patch({ arrayKey: e.target.value })} placeholder="items" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className={labelCls}>Keep items where</label>
                      <div className="flex gap-1">
                        <button onClick={() => patch({ conditions: [...filterConds, { field: "", operator: "equals", value: "" }], condition: "" })} className="text-blue-400 text-xs hover:underline">+ Add</button>
                        {filterConds.length === 0 && <button onClick={() => patch({ condition: local.condition || "item.active === true", conditions: [] })} className="text-gray-400 text-xs hover:underline ml-2">JS mode</button>}
                      </div>
                    </div>
                    {useStructured ? (
                      <>
                        {filterConds.length > 1 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">Combine:</span>
                            <select className="bg-gray-700 text-white text-xs rounded px-2 py-1" value={local.combineMode || "AND"} onChange={(e) => patch({ combineMode: e.target.value })}>
                              <option value="AND">AND (all must pass)</option>
                              <option value="OR">OR (any must pass)</option>
                            </select>
                          </div>
                        )}
                        <div className="space-y-2">
                          {filterConds.map((c, i) => (
                            <div key={i} className="bg-gray-750 rounded p-2 space-y-1 border border-gray-600">
                              <div className="flex gap-1 items-center">
                                <input className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-xs" placeholder="item field (e.g. active)" value={c.field} onChange={(e) => { const n = [...filterConds]; n[i] = { ...n[i], field: e.target.value }; patch({ conditions: n }); }} />
                                <button onClick={() => patch({ conditions: filterConds.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-400 text-xs px-1">×</button>
                              </div>
                              <select className="w-full bg-gray-700 text-white rounded px-2 py-1 text-xs" value={c.operator} onChange={(e) => { const n = [...filterConds]; n[i] = { ...n[i], operator: e.target.value }; patch({ conditions: n }); }}>
                                {FILTER_OPS.map((op) => <option key={op.v} value={op.v}>{op.l}</option>)}
                              </select>
                              {!noValueOps.has(c.operator) && (
                                <input className="w-full bg-gray-700 text-white rounded px-2 py-1 text-xs" placeholder="value or {{$input.field}}" value={c.value} onChange={(e) => { const n = [...filterConds]; n[i] = { ...n[i], value: e.target.value }; patch({ conditions: n }); }} />
                              )}
                            </div>
                          ))}
                          {filterConds.length === 0 && (
                            <p className="text-xs text-gray-500">Click "+ Add" to add a condition, or use JS mode.</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div>
                        <textarea className={inputCls + " font-mono resize-none"} rows={3} value={local.condition || ""} onChange={(e) => patch({ condition: e.target.value })} placeholder="item.active === true" />
                        <button onClick={() => patch({ conditions: [{ field: "", operator: "equals", value: "" }], condition: "" })} className="text-blue-400 text-xs hover:underline mt-1">Switch to structured</button>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Switch */}
            {nodeType === "switch" && (
              <>
                <div>
                  <label className={labelCls}>Value Field (supports {`{{$input.field}}`})</label>
                  <ExpressionInput value={local.field || ""} onChange={(v) => patch({ field: v })} placeholder="{{$input.status}}" suggestions={inputSuggestions} />
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
                  <ExpressionInput value={local.to || ""} onChange={(v) => patch({ to: v })} placeholder="{{$input.email}}" suggestions={inputSuggestions} />
                </div>
                <div>
                  <label className={labelCls}>Subject</label>
                  <ExpressionInput value={local.subject || ""} onChange={(v) => patch({ subject: v })} placeholder="Hello {{$input.name}}" suggestions={inputSuggestions} />
                </div>
                <div>
                  <label className={labelCls}>Body</label>
                  <ExpressionInput multiline value={local.body || ""} onChange={(v) => patch({ body: v })} placeholder="Hi {{$input.name}}, ..." className={inputCls + " resize-none"} suggestions={inputSuggestions} />
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
                  <ExpressionInput multiline value={local.responseBody || ""} onChange={(v) => patch({ responseBody: v })} placeholder={'{"ok": true, "id": "{{$input.id}}"}'} className={inputCls + " font-mono resize-none"} suggestions={inputSuggestions} />
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
                  <select className={inputCls} value={local.model || "claude-haiku-4-5-20251001"} onChange={(e) => patch({ model: e.target.value })}>
                    <optgroup label="Claude 5 (Latest)">
                      <option value="claude-sonnet-5">claude-sonnet-5 (Recommended)</option>
                      <option value="claude-opus-5">claude-opus-5 (Most capable)</option>
                      <option value="claude-fable-5">claude-fable-5</option>
                    </optgroup>
                    <optgroup label="Claude 4 / Previous">
                      <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (Fast &amp; cheap)</option>
                      <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>System Prompt (supports {`{{$input.field}}`})</label>
                  <ExpressionInput multiline value={local.systemPrompt || ""} onChange={(v) => patch({ systemPrompt: v })} placeholder="You are a helpful assistant." className={inputCls + " resize-none"} suggestions={inputSuggestions} />
                </div>
                <div>
                  <label className={labelCls}>User Prompt (supports {`{{$input.field}}`})</label>
                  <ExpressionInput multiline value={local.userPrompt || ""} onChange={(v) => patch({ userPrompt: v })} placeholder="Summarize this: {{$input.text}}" className={inputCls + " resize-none"} suggestions={inputSuggestions} />
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
                      <div key={i} className="flex gap-1 items-center">
                        <input className="w-28 bg-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none" placeholder="output.key" value={m.key} onChange={(e) => { const n = [...mappings]; n[i] = { ...n[i], key: e.target.value }; patch({ mappings: n }); }} />
                        <ExpressionInput className="flex-1" placeholder="{{$input.field}}" value={m.value} onChange={(v) => { const n = [...mappings]; n[i] = { ...n[i], value: v }; patch({ mappings: n }); }} suggestions={inputSuggestions} />
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
                    <ExpressionInput value={local.inputField || ""} onChange={(v) => patch({ inputField: v })} placeholder="{{body.date}} or 2024-01-01" suggestions={inputSuggestions} />
                  </div>
                )}
                {(local.operation === "diff" || local.operation === "isAfter" || local.operation === "isBefore") && (
                  <div>
                    <label className={labelCls}>Compare Date</label>
                    <ExpressionInput value={local.compareField || ""} onChange={(v) => patch({ compareField: v })} placeholder="{{body.endDate}}" suggestions={inputSuggestions} />
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
                    <ExpressionInput value={local.inputField || ""} onChange={(v) => patch({ inputField: v })} placeholder="{{body.text}}" suggestions={inputSuggestions} />
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

            {/* Validate */}
            {nodeType === "validate" && (
              <ValidateConfig local={local} patch={patch} inputCls={inputCls} labelCls={labelCls} />
            )}

            {/* Split in Batches */}
            {nodeType === "splitBatches" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Array Key</label>
                  <input className={inputCls} value={(local.arrayKey as string) || "items"} onChange={(e) => patch({ arrayKey: e.target.value })} placeholder="items" />
                  <p className="text-xs text-gray-500 mt-0.5">Field on $input containing the array to split.</p>
                </div>
                <div>
                  <label className={labelCls}>Batch Size</label>
                  <input className={inputCls} type="number" min="1" max="1000" value={(local.batchSize as string) || "10"} onChange={(e) => patch({ batchSize: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Output Field</label>
                  <input className={inputCls} value={(local.outputKey as string) || "batch"} onChange={(e) => patch({ outputKey: e.target.value })} placeholder="batch" />
                  <p className="text-xs text-gray-500 mt-0.5">Output includes this field (first batch), _batches (all), _batchCount, _totalItems.</p>
                </div>
              </div>
            )}

            {/* JSON Path */}
            {nodeType === "jsonPath" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Operation</label>
                  <select className={inputCls} value={local.operation || "get"} onChange={(e) => patch({ operation: e.target.value })}>
                    <option value="get">Get — extract one value</option>
                    <option value="set">Set — assign a value</option>
                    <option value="delete">Delete — remove a field</option>
                    <option value="pick">Pick — keep only listed fields</option>
                    <option value="omit">Omit — remove listed fields</option>
                    <option value="rename">Rename — rename a field</option>
                  </select>
                </div>
                {(local.operation === "get" || local.operation === "set" || local.operation === "delete") && (
                  <div>
                    <label className={labelCls}>Path (dot notation, e.g. user.address.city)</label>
                    <input className={inputCls + " font-mono"} value={(local.path as string) || ""} onChange={(e) => patch({ path: e.target.value })} placeholder="user.name" />
                  </div>
                )}
                {(local.operation === "pick" || local.operation === "omit") && (
                  <div>
                    <label className={labelCls}>Paths (comma-separated)</label>
                    <input className={inputCls + " font-mono"} value={(local.paths as string) || ""} onChange={(e) => patch({ paths: e.target.value })} placeholder="name, email, address.city" />
                  </div>
                )}
                {local.operation === "set" && (
                  <div>
                    <label className={labelCls}>Value (JSON or plain string)</label>
                    <input className={inputCls} value={(local.value as string) || ""} onChange={(e) => { let v: unknown = e.target.value; try { v = JSON.parse(e.target.value); } catch {} patch({ value: v }); }} placeholder='"hello" or 42 or true' />
                  </div>
                )}
                {local.operation === "rename" && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className={labelCls}>From</label>
                      <input className={inputCls + " font-mono"} value={(local.from as string) || ""} onChange={(e) => patch({ from: e.target.value })} placeholder="oldName" />
                    </div>
                    <div className="flex-1">
                      <label className={labelCls}>To</label>
                      <input className={inputCls + " font-mono"} value={(local.to as string) || ""} onChange={(e) => patch({ to: e.target.value })} placeholder="newName" />
                    </div>
                  </div>
                )}
                {local.operation === "get" && (
                  <div>
                    <label className={labelCls}>Output Field</label>
                    <input className={inputCls} value={(local.outputField as string) || "value"} onChange={(e) => patch({ outputField: e.target.value })} placeholder="value" />
                  </div>
                )}
              </div>
            )}

            {/* CSV */}
            {nodeType === "csv" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Operation</label>
                  <select className={inputCls} value={local.operation || "parse"} onChange={(e) => patch({ operation: e.target.value })}>
                    <option value="parse">Parse CSV → rows</option>
                    <option value="stringify">Stringify rows → CSV</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Input Field</label>
                  <input className={inputCls} value={local.inputField || (local.operation === "stringify" ? "rows" : "csv")} onChange={(e) => patch({ inputField: e.target.value })} placeholder={local.operation === "stringify" ? "rows" : "csv"} />
                  <p className="text-xs text-gray-500 mt-0.5">{local.operation === "stringify" ? "Array of objects to convert to CSV" : "CSV string from $input to parse"}</p>
                </div>
                <div>
                  <label className={labelCls}>Output Field</label>
                  <input className={inputCls} value={(local.outputField as string) || (local.operation === "stringify" ? "csv" : "rows")} onChange={(e) => patch({ outputField: e.target.value })} placeholder={local.operation === "stringify" ? "csv" : "rows"} />
                </div>
                <div>
                  <label className={labelCls}>Delimiter</label>
                  <input className={inputCls} value={(local.delimiter as string) || ","} onChange={(e) => patch({ delimiter: e.target.value })} placeholder="," />
                </div>
              </div>
            )}

            {/* HTML Extract */}
            {nodeType === "htmlExtract" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Operation</label>
                  <select className={inputCls} value={local.operation || "text"} onChange={(e) => patch({ operation: e.target.value })}>
                    <option value="text">Strip tags → plain text</option>
                    <option value="select">CSS selector → text array</option>
                    <option value="links">Extract all links</option>
                    <option value="attributes">Extract tag attributes</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Input Field (HTML)</label>
                  <input className={inputCls} value={local.inputField || "body"} onChange={(e) => patch({ inputField: e.target.value })} placeholder="body" />
                </div>
                {local.operation === "select" && (
                  <div>
                    <label className={labelCls}>CSS Selector</label>
                    <input className={inputCls + " font-mono"} value={(local.selector as string) || ""} onChange={(e) => patch({ selector: e.target.value })} placeholder="h1 or .title or #main" />
                    <p className="text-xs text-gray-500 mt-0.5">Supports: tag, .class, #id, tag[attr], tag[attr="val"]</p>
                  </div>
                )}
                {local.operation === "attributes" && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className={labelCls}>Tag</label>
                      <input className={inputCls} value={(local.tag as string) || "a"} onChange={(e) => patch({ tag: e.target.value })} placeholder="a" />
                    </div>
                    <div className="flex-1">
                      <label className={labelCls}>Attribute</label>
                      <input className={inputCls} value={(local.attr as string) || "href"} onChange={(e) => patch({ attr: e.target.value })} placeholder="href" />
                    </div>
                  </div>
                )}
                <div>
                  <label className={labelCls}>Output Field</label>
                  <input className={inputCls} value={(local.outputField as string) || "extracted"} onChange={(e) => patch({ outputField: e.target.value })} placeholder="extracted" />
                </div>
              </div>
            )}

            {nodeType === "stopError" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Error Message</label>
                  <input className={inputCls} value={(local.message as string) || ""} onChange={(e) => patch({ message: e.target.value })} placeholder="Workflow stopped with error" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!local.includeInput} onChange={(e) => patch({ includeInput: e.target.checked })} />
                  <span className={labelCls + " mb-0"}>Include input in error message</span>
                </label>
              </div>
            )}

            {/* Database Node */}
            {nodeType === "database" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Dialect</label>
                  <select className={inputCls} value={(local.dialect as string) || "postgres"} onChange={(e) => patch({ dialect: e.target.value })}>
                    <option value="postgres">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Host</label>
                  <input className={inputCls} value={(local.host as string) || ""} onChange={(e) => patch({ host: e.target.value })} placeholder="localhost" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Port</label>
                    <input className={inputCls} type="number" value={(local.port as string) || ""} onChange={(e) => patch({ port: e.target.value })} placeholder="5432" />
                  </div>
                  <div>
                    <label className={labelCls}>Database</label>
                    <input className={inputCls} value={(local.database as string) || ""} onChange={(e) => patch({ database: e.target.value })} placeholder="mydb" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>User</label>
                    <input className={inputCls} value={(local.user as string) || ""} onChange={(e) => patch({ user: e.target.value })} placeholder="postgres" />
                  </div>
                  <div>
                    <label className={labelCls}>Password</label>
                    <input className={inputCls} type="password" value={(local.password as string) || ""} onChange={(e) => patch({ password: e.target.value })} placeholder="••••••••" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>SQL Query (supports {"{{expressions}}"})</label>
                  <textarea className={inputCls + " resize-y font-mono text-xs"} rows={5} value={(local.query as string) || ""} onChange={(e) => patch({ query: e.target.value })} placeholder={"SELECT * FROM users WHERE id = '{{$input.userId}}'"} />
                </div>
                <div>
                  <label className={labelCls}>Operation</label>
                  <select className={inputCls} value={(local.operation as string) || "query"} onChange={(e) => patch({ operation: e.target.value })}>
                    <option value="query">Query (returns rows)</option>
                    <option value="execute">Execute (no rows)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Slack Node */}
            {nodeType === "slack" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Webhook URL</label>
                  <input className={inputCls} type="password" value={(local.webhookUrl as string) || ""} onChange={(e) => patch({ webhookUrl: e.target.value })} placeholder="https://hooks.slack.com/services/..." />
                </div>
                <div>
                  <label className={labelCls}>Message Text (supports {"{{expressions}}"})</label>
                  <ExpressionInput value={(local.text as string) || ""} onChange={(v) => patch({ text: v })} placeholder={"Hello from {{$input.name}}!"} suggestions={inputSuggestions} />
                </div>
                <div>
                  <label className={labelCls}>Channel (optional)</label>
                  <input className={inputCls} value={(local.channel as string) || ""} onChange={(e) => patch({ channel: e.target.value })} placeholder="#general" />
                </div>
                <div>
                  <label className={labelCls}>Bot Username (optional)</label>
                  <input className={inputCls} value={(local.username as string) || ""} onChange={(e) => patch({ username: e.target.value })} placeholder="Workflow Bot" />
                </div>
                <div>
                  <label className={labelCls}>Icon Emoji (optional)</label>
                  <input className={inputCls} value={(local.iconEmoji as string) || ""} onChange={(e) => patch({ iconEmoji: e.target.value })} placeholder=":robot_face:" />
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
