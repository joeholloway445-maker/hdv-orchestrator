import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface Credential {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

const CREDENTIAL_TYPES = ["API Key", "Basic Auth", "OAuth2", "Database", "Other"];

export function CredentialsPage() {
  const navigate = useNavigate();
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", type: CREDENTIAL_TYPES[0], data: '{"apiKey": ""}' });
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await api.get("/credentials");
    setCreds(data as Credential[]);
    setLoading(false);
  }

  async function create() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(form.data);
    } catch {
      setFormError("Data must be valid JSON");
      return;
    }
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    setFormError("");
    await api.post("/credentials", { name: form.name, type: form.type, data: parsed });
    setShowForm(false);
    setForm({ name: "", type: CREDENTIAL_TYPES[0], data: '{"apiKey": ""}' });
    load();
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete credential "${name}"?`)) return;
    await api.delete(`/credentials/${id}`);
    load();
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white text-sm">
          ← Back
        </button>
        <h1 className="text-xl font-bold">Credentials</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          + New Credential
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {showForm && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">New Credential</h2>
            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Name</label>
                <input
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="My API Key"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Type</label>
                <select
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {CREDENTIAL_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Data (JSON — will be encrypted)</label>
                <textarea
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none resize-none"
                  rows={4}
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                />
              </div>
              {formError && <p className="text-red-400 text-xs">{formError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={create}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Save Credential
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : creds.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            <p className="text-lg mb-2">🔐 No credentials yet</p>
            <p className="text-sm">Credentials are stored AES-256-GCM encrypted</p>
          </div>
        ) : (
          <div className="space-y-3">
            {creds.map((cred) => (
              <div
                key={cred.id}
                className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <p className="text-white font-semibold">{cred.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {cred.type} · Added {new Date(cred.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-gray-600 text-xs mt-1 font-mono">●●●●●●●● (encrypted)</p>
                </div>
                <button
                  onClick={() => del(cred.id, cred.name)}
                  className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-sm transition"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
