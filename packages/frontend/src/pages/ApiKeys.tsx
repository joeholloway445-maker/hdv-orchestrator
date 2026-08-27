import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface ApiKey {
  id: string;
  name: string;
  createdAt: string;
  lastUsed?: string;
  expiresAt?: string;
}

interface CreatedKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
}

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newName, setNewName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/apikeys").then(({ data }) => setKeys(data as ApiKey[]));
  }, []);

  async function createKey() {
    if (!newName.trim()) return;
    const payload: { name: string; expiresInDays?: number } = { name: newName.trim() };
    if (expiresInDays && Number(expiresInDays) > 0) {
      payload.expiresInDays = Number(expiresInDays);
    }
    const { data } = await api.post("/apikeys", payload);
    const d = data as CreatedKey;
    setCreatedKey(d);
    setKeys((prev) => [{ id: d.id, name: d.name, createdAt: d.createdAt }, ...prev]);
    setNewName("");
    setExpiresInDays("");
    setCopied(false);
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? It will stop working immediately.")) return;
    await api.delete(`/apikeys/${id}`);
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  function copyToClipboard() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey.key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white text-sm transition">
          ← Dashboard
        </button>
        <h1 className="text-xl font-bold">API Keys</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        {/* Created key modal */}
        {createdKey && (
          <div className="bg-yellow-900/30 border border-yellow-600 rounded-xl p-5 space-y-3">
            <p className="text-yellow-300 font-semibold text-sm">
              ⚠ This is the only time you'll see this key. Copy it now and store it securely.
            </p>
            <p className="text-gray-300 text-sm">
              Key: <span className="font-medium text-white">{createdKey.name}</span>
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-900 rounded px-3 py-2 text-sm font-mono break-all text-green-300">
                {createdKey.key}
              </code>
              <button
                onClick={copyToClipboard}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition shrink-0"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="text-xs text-gray-400 hover:text-white transition"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Create key form */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-lg">Create New API Key</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
              placeholder="Key name (e.g. CI pipeline, n8n integration)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createKey()}
            />
            <button
              onClick={createKey}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-sm transition"
            >
              Create
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 shrink-0">Expires in</label>
            <select
              className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-blue-500"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            >
              <option value="">Never</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
          <p className="text-xs text-gray-500">
            API keys let you authenticate programmatic API calls using the{" "}
            <code className="text-gray-400">x-api-key</code> request header.
          </p>
        </div>

        {/* Existing keys list */}
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">Existing Keys</h2>
          {keys.length === 0 ? (
            <p className="text-gray-500 text-sm">No API keys yet.</p>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{k.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Created {new Date(k.createdAt).toLocaleDateString()}
                      {k.lastUsed && ` · Last used ${new Date(k.lastUsed).toLocaleDateString()}`}
                      {k.expiresAt && ` · Expires ${new Date(k.expiresAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button
                    onClick={() => revokeKey(k.id)}
                    className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-sm transition shrink-0"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
