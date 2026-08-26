import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuthStore } from "../store/auth";
import { DreamGenerator } from "../components/DreamGenerator";

interface Workflow {
  id: string;
  name: string;
  active: boolean;
  description?: string;
  tags: string[];
  updatedAt: string;
  _count?: { executions: number };
  executions?: Array<{ status: string; startedAt: string }>;
}

export function DashboardPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [showDreamGenerator, setShowDreamGenerator] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  async function importWorkflow() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const parsed = JSON.parse(text) as { nodes: unknown; edges: unknown; name?: string };
      const { data } = await api.post("/workflows", {
        name: parsed.name || file.name.replace(/\.json$/, "") || "Imported Workflow",
        nodes: parsed.nodes || [],
        edges: parsed.edges || [],
      });
      navigate(`/workflow/${(data as Workflow).id}`);
    };
    input.click();
  }

  function fetchWorkflows(s: string, tag: string, active: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (s) params.set("search", s);
    if (tag) params.set("tag", tag);
    if (active) params.set("active", active);
    api.get(`/workflows?${params.toString()}`).then(({ data }) => {
      const list = Array.isArray(data) ? data : ((data as { items?: Workflow[] }).items ?? []);
      setWorkflows(list as Workflow[]);
      setLoading(false);
    });
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchWorkflows(search, tagFilter, activeFilter), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, tagFilter, activeFilter]);

  async function createWorkflow() {
    const { data } = await api.post("/workflows", { name: "Untitled Workflow" });
    navigate(`/workflow/${(data as Workflow).id}`);
  }

  async function generateWorkflow(nodes: unknown[], edges: unknown[]) {
    const { data } = await api.post("/workflows", {
      name: "AI Generated Workflow",
      nodes,
      edges,
    });
    navigate(`/workflow/${(data as Workflow).id}`);
  }

  async function duplicateWorkflow(wfId: string) {
    const { data } = await api.post(`/workflows/${wfId}/duplicate`);
    setWorkflows((prev) => [data as Workflow, ...prev]);
  }

  async function toggleActive(wf: Workflow) {
    const { data } = await api.put(`/workflows/${wf.id}`, { active: !wf.active });
    setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? { ...w, active: (data as Workflow).active } : w)));
  }

  async function exportWorkflow(wf: Workflow) {
    const { data } = await api.get(`/workflows/${wf.id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${wf.name.replace(/[^a-z0-9_-]/gi, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteWorkflow(id: string) {
    if (!confirm("Delete this workflow?")) return;
    await api.delete(`/workflows/${id}`);
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {showDreamGenerator && (
        <DreamGenerator
          onClose={() => setShowDreamGenerator(false)}
          onImport={generateWorkflow}
        />
      )}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Workflow Platform</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/templates")}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Templates
          </button>
          <button
            onClick={() => navigate("/memory")}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Memory
          </button>
          <button
            onClick={() => navigate("/variables")}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Variables
          </button>
          <button
            onClick={() => navigate("/executions")}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Executions
          </button>
          <button
            onClick={() => navigate("/credentials")}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Credentials
          </button>
          <button
            onClick={() => navigate("/webhooks")}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Webhooks
          </button>
          <button
            onClick={() => navigate("/schedules")}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Schedules
          </button>
          <button
            onClick={() => navigate("/tokens")}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            API Tokens
          </button>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400 text-sm">{user?.email}</span>
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">My Workflows</h2>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/templates")}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg font-medium transition text-sm"
            >
              From Template
            </button>
            <button
              onClick={importWorkflow}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg font-medium transition text-sm"
            >
              Import JSON
            </button>
            <button
              onClick={() => setShowDreamGenerator(true)}
              className="bg-indigo-700 hover:bg-indigo-600 px-4 py-2 rounded-lg font-medium transition text-sm"
            >
              ✦ AI Generate
            </button>
            <button
              onClick={createWorkflow}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition"
            >
              + New Workflow
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <input
            type="text"
            className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            placeholder="Search workflows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            type="text"
            className="w-40 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            placeholder="Filter by tag..."
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          />
          <select
            className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-blue-500 text-sm"
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
        </div>

        {loading ? (
          <div className="text-gray-500">Loading...</div>
        ) : (() => {
          const filtered = workflows;
          return filtered.length === 0 ? (
            <div className="text-center py-24 text-gray-500">
              {search || tagFilter || activeFilter ? (
                <p className="text-lg">No workflows match your filters</p>
              ) : (
                <>
                  <p className="text-lg mb-3">No workflows yet</p>
                  <button onClick={createWorkflow} className="text-blue-400 hover:underline">
                    Create your first workflow →
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((wf) => (
              <div
                key={wf.id}
                className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex items-center justify-between hover:border-gray-600 transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-white truncate">{wf.name}</h3>
                    {wf.tags?.map((tag) => (
                      <span key={tag} className="bg-blue-900/40 text-blue-300 text-xs rounded-full px-2 py-0.5">{tag}</span>
                    ))}
                  </div>
                  {wf.description && (
                    <p className="text-gray-400 text-xs mt-0.5 truncate">{wf.description}</p>
                  )}
                  <p className="text-gray-500 text-sm mt-0.5 flex items-center gap-2 flex-wrap">
                    {wf.active ? (
                      <span className="text-green-400">● Active</span>
                    ) : (
                      <span className="text-gray-600">○ Inactive</span>
                    )}
                    <span>·</span>
                    <span>Updated {new Date(wf.updatedAt).toLocaleDateString()}</span>
                    {wf._count && (
                      <>
                        <span>·</span>
                        <span className="text-gray-500">{wf._count.executions} run{wf._count.executions !== 1 ? "s" : ""}</span>
                      </>
                    )}
                    {wf.executions?.[0] && (
                      <>
                        <span>·</span>
                        <span className={
                          wf.executions[0].status === "SUCCESS" ? "text-green-500" :
                          wf.executions[0].status === "FAILED" ? "text-red-400" :
                          "text-yellow-400"
                        }>
                          Last: {wf.executions[0].status.toLowerCase()}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => toggleActive(wf)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition font-medium ${
                      wf.active
                        ? "bg-green-900/40 hover:bg-green-900/60 text-green-400"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-400"
                    }`}
                    title={wf.active ? "Click to deactivate" : "Click to activate"}
                  >
                    {wf.active ? "Active" : "Inactive"}
                  </button>
                  <button
                    onClick={() => navigate(`/workflow/${wf.id}`)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => duplicateWorkflow(wf.id)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
                    title="Duplicate workflow"
                  >
                    ⧉
                  </button>
                  <button
                    onClick={() => exportWorkflow(wf)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
                    title="Export as JSON"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => deleteWorkflow(wf.id)}
                    className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-sm transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
              ))}
            </div>
          );
        })()}
      </main>
    </div>
  );
}
