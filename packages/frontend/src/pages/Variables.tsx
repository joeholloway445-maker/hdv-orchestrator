import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface GlobalVar {
  id: string;
  key: string;
  value: unknown;
  updatedAt: string;
}

export function VariablesPage() {
  const navigate = useNavigate();
  const [vars, setVars] = useState<GlobalVar[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function load() {
    const { data } = await api.get("/variables");
    setVars(data as GlobalVar[]);
  }

  useEffect(() => { load(); }, []);

  async function addVar() {
    if (!newKey.trim()) return;
    setSaving(true);
    let parsed: unknown = newValue;
    try { parsed = JSON.parse(newValue); } catch {}
    await api.put(`/variables/${encodeURIComponent(newKey.trim())}`, { value: parsed });
    setNewKey("");
    setNewValue("");
    await load();
    setSaving(false);
  }

  async function deleteVar(key: string) {
    await api.delete(`/variables/${encodeURIComponent(key)}`);
    setVars((v) => v.filter((x) => x.key !== key));
  }

  async function saveEdit(key: string) {
    let parsed: unknown = editValue;
    try { parsed = JSON.parse(editValue); } catch {}
    await api.put(`/variables/${encodeURIComponent(key)}`, { value: parsed });
    setEditingId(null);
    await load();
  }

  function displayValue(v: unknown): string {
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white text-sm transition">
          ← Dashboard
        </button>
        <h1 className="text-lg font-semibold">Global Variables</h1>
        <p className="text-xs text-gray-500 ml-2">Shared key-value store accessible across all workflows via <code className="bg-gray-700 px-1 rounded">{"{{$vars.KEY}}"}</code></p>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Add new variable */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Add / Update Variable</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500 font-mono"
              placeholder="KEY"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <input
              className="flex-[2] bg-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              placeholder='value (string or JSON: {"x":1})'
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addVar()}
            />
            <button
              onClick={addVar}
              disabled={saving || !newKey.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {saving ? "Saving…" : "Set"}
            </button>
          </div>
        </div>

        {/* Variable list */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {vars.length === 0 ? (
            <p className="text-gray-600 text-sm p-6 text-center">No global variables yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Key</th>
                  <th className="text-left px-4 py-2">Value</th>
                  <th className="text-left px-4 py-2">Updated</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {vars.map((v) => (
                  <tr key={v.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-mono text-blue-300 whitespace-nowrap">{v.key}</td>
                    <td className="px-4 py-3 text-gray-300 max-w-xs">
                      {editingId === v.id ? (
                        <div className="flex gap-1">
                          <input
                            className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(v.key); if (e.key === "Escape") setEditingId(null); }}
                            autoFocus
                          />
                          <button onClick={() => saveEdit(v.key)} className="text-green-400 hover:text-green-300 text-xs px-1">✓</button>
                          <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-white text-xs px-1">✕</button>
                        </div>
                      ) : (
                        <span
                          className="truncate block max-w-xs cursor-pointer hover:text-white"
                          title={displayValue(v.value)}
                          onClick={() => { setEditingId(v.id); setEditValue(displayValue(v.value)); }}
                        >
                          {displayValue(v.value)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(v.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteVar(v.key)}
                        className="text-gray-500 hover:text-red-400 transition text-xs"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
