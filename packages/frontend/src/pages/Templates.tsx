import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";

interface Template {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [using, setUsing] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/templates").then(({ data }) => {
      setTemplates(data as Template[]);
      setLoading(false);
    });
  }, []);

  async function useTemplate(id: string) {
    setUsing(id);
    try {
      const { data } = await api.post(`/templates/${id}/use`);
      navigate(`/workflow/${(data as { id: string }).id}`);
    } finally {
      setUsing(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <Link to="/dashboard" className="text-gray-400 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <h1 className="text-xl font-bold">Workflow Templates</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-gray-400 mb-8">Start from a pre-built template and customize it to your needs.</p>

        {loading ? (
          <div className="text-gray-500">Loading templates…</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="bg-gray-800 border border-gray-700 rounded-xl p-5 hover:border-gray-500 transition flex flex-col gap-3"
              >
                <div>
                  <h3 className="font-semibold text-white">{tpl.name}</h3>
                  <p className="text-gray-400 text-sm mt-1">{tpl.description}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {tpl.tags.map((tag) => (
                      <span key={tag} className="bg-blue-900/40 text-blue-300 text-xs rounded-full px-2 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => useTemplate(tpl.id)}
                    disabled={using === tpl.id}
                    className="ml-4 shrink-0 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                  >
                    {using === tpl.id ? "Creating…" : "Use Template"}
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
