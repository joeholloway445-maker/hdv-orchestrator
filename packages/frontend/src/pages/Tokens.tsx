import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export function TokensPage() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [newName, setNewName] = useState("");
  const [created, setCreated] = useState<{ token: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/tokens").then(({ data }) => setTokens(data as ApiToken[]));
  }, []);

  async function createToken() {
    if (!newName.trim()) return;
    const { data } = await api.post("/tokens", { name: newName.trim() });
    const d = data as ApiToken & { token: string };
    setCreated({ token: d.token });
    setTokens((prev) => [d, ...prev]);
    setNewName("");
  }

  async function revokeToken(id: string) {
    if (!confirm("Revoke this token? It will stop working immediately.")) return;
    await api.delete(`/tokens/${id}`);
    setTokens((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
        <h1 className="text-xl font-bold">API Tokens</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        {created && (
          <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 space-y-2">
            <p className="text-green-400 font-medium">Token created — copy it now, it won't be shown again:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-900 rounded px-3 py-2 text-sm font-mono break-all text-green-300">{created.token}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(created.token); }}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition shrink-0"
              >
                Copy
              </button>
            </div>
            <button onClick={() => setCreated(null)} className="text-xs text-gray-400 hover:text-white transition">Dismiss</button>
          </div>
        )}

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-lg">Create New Token</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
              placeholder="Token name (e.g. CI/CD, n8n integration)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createToken()}
            />
            <button onClick={createToken} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-sm transition">
              Create
            </button>
          </div>
          <p className="text-xs text-gray-500">
            API tokens let you authenticate programmatic API calls instead of using your password. They use the same permissions as your account.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold text-lg">Existing Tokens</h2>
          {tokens.length === 0 ? (
            <p className="text-gray-500 text-sm">No tokens yet.</p>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => (
                <div key={t.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      <code className="text-gray-400">{t.prefix}…</code>
                      {" · "}Created {new Date(t.createdAt).toLocaleDateString()}
                      {t.lastUsedAt && ` · Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button
                    onClick={() => revokeToken(t.id)}
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
