import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";

interface Template {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

function tagClass(tag: string) {
  if (tag === "hdv") return "bg-indigo-900/60 text-indigo-300";
  if (["hope", "knoll", "apex", "dream", "vision"].includes(tag)) return "bg-purple-900/40 text-purple-300";
  return "bg-blue-900/40 text-blue-300";
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [using, setUsing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("");
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

  const filtered = templates.filter((tpl) => {
    const matchesSearch = !search || tpl.name.toLowerCase().includes(search.toLowerCase()) || tpl.description.toLowerCase().includes(search.toLowerCase());
    const matchesTag = !activeTag || tpl.tags.includes(activeTag);
    return matchesSearch && matchesTag;
  });

  const hdvTemplates = filtered.filter((t) => t.tags.includes("hdv"));
  const otherTemplates = filtered.filter((t) => !t.tags.includes("hdv"));

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <Link to="/dashboard" className="text-gray-400 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <h1 className="text-xl font-bold">Workflow Templates</h1>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex gap-3 mb-8 flex-wrap items-center">
          <input
            className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {["", "hdv", "ai", "webhook", "security", "data"].map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTag === tag
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {tag || "All"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-gray-500">Loading templates…</div>
        ) : (
          <>
            {hdvTemplates.length > 0 && (
              <section className="mb-10">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-indigo-400 text-lg">✦</span>
                  <h2 className="text-lg font-semibold text-indigo-300">HDV Agent Templates</h2>
                  <span className="text-gray-600 text-sm">— HOPE · KNOLL · APEX · DREAM · VISION</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {hdvTemplates.map((tpl) => (
                    <TemplateCard key={tpl.id} tpl={tpl} using={using} onUse={useTemplate} hdv />
                  ))}
                </div>
              </section>
            )}

            {otherTemplates.length > 0 && (
              <section>
                {hdvTemplates.length > 0 && <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Standard Templates</h2>}
                <div className="grid gap-4 sm:grid-cols-2">
                  {otherTemplates.map((tpl) => (
                    <TemplateCard key={tpl.id} tpl={tpl} using={using} onUse={useTemplate} />
                  ))}
                </div>
              </section>
            )}

            {filtered.length === 0 && (
              <p className="text-gray-500">No templates match your search.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function TemplateCard({ tpl, using, onUse, hdv }: { tpl: Template; using: string | null; onUse: (id: string) => void; hdv?: boolean }) {
  return (
    <div className={`border rounded-xl p-5 hover:border-opacity-80 transition flex flex-col gap-3 ${
      hdv
        ? "bg-indigo-950/30 border-indigo-800/40 hover:border-indigo-600/60"
        : "bg-gray-800 border-gray-700 hover:border-gray-500"
    }`}>
      <div>
        <h3 className="font-semibold text-white">{tpl.name}</h3>
        <p className="text-gray-400 text-sm mt-1">{tpl.description}</p>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {tpl.tags.map((tag) => (
            <span key={tag} className={`text-xs rounded-full px-2 py-0.5 ${tagClass(tag)}`}>
              {tag}
            </span>
          ))}
        </div>
        <button
          onClick={() => onUse(tpl.id)}
          disabled={using === tpl.id}
          className={`ml-4 shrink-0 px-4 py-1.5 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition ${
            hdv ? "bg-indigo-700 hover:bg-indigo-600" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {using === tpl.id ? "Creating…" : "Use Template"}
        </button>
      </div>
    </div>
  );
}
