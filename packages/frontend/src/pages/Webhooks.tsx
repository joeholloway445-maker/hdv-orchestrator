import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface WebhookEntry {
  workflowId: string;
  workflowName: string;
  webhookId: string;
  active: boolean;
  authType?: string;
}

export function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const navigate = useNavigate();

  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

  useEffect(() => {
    api.get("/webhooks/list").then(({ data }) => {
      setWebhooks(data as WebhookEntry[]);
      setLoading(false);
    });
  }, []);

  function webhookUrl(webhookId: string) {
    return `${apiBase}/webhooks/trigger/${webhookId}`;
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
        <h1 className="text-xl font-bold">Webhooks</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <p className="text-gray-400 text-sm">All webhook trigger endpoints across your workflows. Only active workflows will respond to requests.</p>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No webhook triggers found</p>
            <p className="text-sm mt-2">Add a Webhook Trigger node to a workflow to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((wh) => {
              const url = webhookUrl(wh.webhookId);
              return (
                <div key={wh.webhookId} className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <button
                        onClick={() => navigate(`/workflow/${wh.workflowId}`)}
                        className="font-semibold text-blue-400 hover:underline truncate block"
                      >
                        {wh.workflowName}
                      </button>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                        {wh.active ? (
                          <span className="text-green-400">● Active</span>
                        ) : (
                          <span className="text-gray-600">○ Inactive</span>
                        )}
                        {wh.authType && wh.authType !== "none" && (
                          <span className="bg-yellow-900/30 text-yellow-400 rounded px-1.5 py-0.5 text-xs capitalize">{wh.authType} auth</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-900 rounded px-3 py-2 text-xs font-mono text-gray-300 truncate">{url}</code>
                    <button
                      onClick={() => copy(url)}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition shrink-0"
                    >
                      {copied === url ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Accepts: <code className="text-gray-400">GET POST PUT DELETE</code>
                    {" · "}ID: <code className="text-gray-400">{wh.webhookId}</code>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
