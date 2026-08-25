import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface MemoryEntry {
  id: string;
  key: string;
  value: unknown;
  workflowId: string;
  updatedAt: string;
}

export function MemoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await api.get("/memory");
    setEntries(data as MemoryEntry[]);
    setLoading(false);
  }

  async function save() {
    if (!newKey.trim()) { setError("Key is required"); return; }
    let parsed: unknown;
    try {
      parsed = JSON.parse(newValue || "null");
    } catch {
      setError("Value must be valid JSON");
      return;
    }
    setError("");
    await api.put(`/memory/${encodeURIComponent(newKey)}`, { value: parsed });
    setNewKey("");
    setNewValue("");
    load();
  }

  async function del(key: string) {
    if (!confirm(`Delete memory key "${key}"?`)) return;
    await api.delete(`/memory/${encodeURIComponent(key)}`);
    load();
  }

  async function applyEdit() {
    if (!editing) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(editing.value);
    } catch {
      return;
    }
    await api.put(`/memory/${encodeURIComponent(editing.key)}`, { value: parsed });
    setEditing(null);
    load();
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white text-sm">
          ← Back
        </button>
        <h1 className="text-xl font-bold">User Memory</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">New Entry</h2>
          <div className="flex gap-3 mb-3">
            <input
              className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
          </div>
          <textarea
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none mb-3"
            rows={3}
            placeholder='Value (JSON, e.g. "hello" or {"count": 0})'
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
          <button
            onClick={save}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Save
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-gray-600 text-center py-12">No memory entries yet</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                {editing?.key === entry.key ? (
                  <div>
                    <p className="text-white font-mono font-semibold mb-2">{entry.key}</p>
                    <textarea
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none resize-none mb-2"
                      rows={3}
                      value={editing.value}
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <button onClick={applyEdit} className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg text-sm transition">
                        Save
                      </button>
                      <button onClick={() => setEditing(null)} className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded-lg text-sm transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-mono font-semibold">{entry.key}</p>
                      {entry.workflowId && (
                        <p className="text-gray-500 text-xs mt-0.5">scope: {entry.workflowId}</p>
                      )}
                      <pre className="text-gray-400 text-xs mt-2 font-mono bg-gray-900 rounded p-2 overflow-auto max-h-24">
                        {JSON.stringify(entry.value, null, 2)}
                      </pre>
                      <p className="text-gray-600 text-xs mt-1">
                        Updated {new Date(entry.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setEditing({ key: entry.key, value: JSON.stringify(entry.value, null, 2) })}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => del(entry.key)}
                        className="px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-xs transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
