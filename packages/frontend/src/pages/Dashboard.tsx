import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuthStore } from "../store/auth";

interface Workflow {
  id: string;
  name: string;
  active: boolean;
  updatedAt: string;
}

export function DashboardPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/workflows").then(({ data }) => {
      setWorkflows(data as Workflow[]);
      setLoading(false);
    });
  }, []);

  async function createWorkflow() {
    const { data } = await api.post("/workflows", { name: "Untitled Workflow" });
    navigate(`/workflow/${(data as Workflow).id}`);
  }

  async function deleteWorkflow(id: string) {
    if (!confirm("Delete this workflow?")) return;
    await api.delete(`/workflows/${id}`);
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Workflow Platform</h1>
        <div className="flex items-center gap-4">
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
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold">My Workflows</h2>
          <button
            onClick={createWorkflow}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition"
          >
            + New Workflow
          </button>
        </div>

        {loading ? (
          <div className="text-gray-500">Loading...</div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-24 text-gray-500">
            <p className="text-lg mb-3">No workflows yet</p>
            <button onClick={createWorkflow} className="text-blue-400 hover:underline">
              Create your first workflow →
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex items-center justify-between hover:border-gray-600 transition"
              >
                <div>
                  <h3 className="font-semibold text-white">{wf.name}</h3>
                  <p className="text-gray-500 text-sm mt-0.5">
                    {wf.active ? (
                      <span className="text-green-400">● Active</span>
                    ) : (
                      <span className="text-gray-600">○ Inactive</span>
                    )}{" "}
                    · {new Date(wf.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/workflow/${wf.id}`)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
                  >
                    Edit
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
        )}
      </main>
    </div>
  );
}
