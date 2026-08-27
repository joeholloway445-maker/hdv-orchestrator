import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { PlanBadge } from "../components/PlanBadge";
import { StudioGate } from "../components/StudioGate";
import { StatusChip } from "../components/StatusChip";
import { TimeAgo } from "../components/TimeAgo";

interface CompanionExecution {
  id: string;
  status: string;
  startedAt: string;
}

interface CompanionData {
  workflow?: { id: string; name: string; active: boolean } | null;
  latestExecution?: CompanionExecution | null;
}

interface Workflow {
  id: string;
  name: string;
  active: boolean;
  tags: string[];
  executions?: Array<{ status: string }>;
}

interface MemoryRecord {
  id: string;
  content: string;
  tags?: string[];
  createdAt: string;
}

interface SimNode {
  nodeId: string;
  nodeType: string;
  simulated: boolean;
  output?: unknown;
}

interface SimResult {
  nodes?: SimNode[];
  grade?: string;
}

function MoodFace({ status }: { status?: string }) {
  const map: Record<string, string> = {
    SUCCESS: "😊",
    FAILED: "😟",
    ERROR: "😟",
    RUNNING: "🔄",
  };
  const emoji = status ? (map[status.toUpperCase()] ?? "😴") : "😴";
  return <div className="text-8xl text-center select-none companion-pulse">{emoji}</div>;
}

function moodLabel(status?: string): string {
  if (!status) return "Dormant — waiting for first activation";
  const map: Record<string, string> = {
    SUCCESS: "Active — last run successful",
    FAILED: "Distressed — last run had errors",
    ERROR: "Distressed — last run had errors",
    RUNNING: "Thinking...",
  };
  return map[status.toUpperCase()] ?? "Dormant — waiting for first activation";
}

function GradeChip({ grade }: { grade?: string }) {
  if (!grade) return null;
  const colors: Record<string, string> = {
    A: "bg-green-900/60 text-green-300",
    B: "bg-blue-900/60 text-blue-300",
    C: "bg-yellow-900/60 text-yellow-300",
    D: "bg-red-900/60 text-red-300",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-bold ${colors[grade] ?? "bg-gray-700 text-gray-400"}`}>
      Grade {grade}
    </span>
  );
}

export function CompanionPage() {
  const navigate = useNavigate();
  const [companion, setCompanion] = useState<CompanionData | null>(null);
  const [activating, setActivating] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [memory, setMemory] = useState<MemoryRecord[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [simText, setSimText] = useState("");
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  async function fetchCompanion() {
    try {
      const { data } = await api.get<CompanionData>("/hope/companion");
      setCompanion(data);
    } catch { /* companion may not exist yet */ }
  }

  async function activate() {
    setActivating(true);
    try {
      await api.post("/hope/companion");
      await fetchCompanion();
    } finally {
      setActivating(false);
    }
  }

  async function runSim() {
    if (!simText.trim()) return;
    setSimRunning(true);
    setSimError(null);
    try {
      const { data } = await api.post<SimResult>("/simulate", {
        nodes: [],
        edges: [],
        triggerData: { intent: simText },
      });
      setSimResult(data);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Simulation failed";
      setSimError(msg);
    } finally {
      setSimRunning(false);
    }
  }

  useEffect(() => {
    fetchCompanion();
    api
      .get<Workflow[] | { items?: Workflow[] }>("/workflows")
      .then(({ data }) => {
        setWorkflows(Array.isArray(data) ? data : (data.items ?? []));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!memoryOpen || memory.length > 0) return;
    api
      .get<MemoryRecord[]>("/memory")
      .then(({ data }) => setMemory(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [memoryOpen, memory.length]);

  const execStatus = companion?.latestExecution?.status;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <style>{`
        @keyframes companionGlow {
          0%, 100% { box-shadow: 0 0 18px 4px rgba(59,111,255,0.25); }
          50%       { box-shadow: 0 0 36px 10px rgba(59,111,255,0.55); }
        }
        .companion-glow { animation: companionGlow 3s ease-in-out infinite; }
        @keyframes companionPulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.06); }
        }
        .companion-pulse { animation: companionPulse 2.5s ease-in-out infinite; display: inline-block; }
      `}</style>

      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-gray-400 hover:text-white text-sm transition"
          >
            ← Dashboard
          </button>
          <span className="text-gray-700">|</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Periliminal Space</h1>
            <p className="text-xs text-gray-400 leading-none mt-0.5">Your HOPE Companion</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {companion?.workflow ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-900/60 text-green-300">
              ● Active
            </span>
          ) : (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
              ○ Inactive
            </span>
          )}
          <PlanBadge />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Companion card */}
        <div className="companion-glow bg-[#0E1524] border border-[#1e2d4a] rounded-2xl p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#3B6FFF]/5 to-transparent pointer-events-none" />
          <MoodFace status={execStatus} />
          <p className="mt-4 text-lg font-semibold text-white">{moodLabel(execStatus)}</p>
          {companion?.latestExecution?.startedAt && (
            <p className="mt-1 text-sm text-gray-400">
              Last activated{" "}
              <TimeAgo date={companion.latestExecution.startedAt} className="text-gray-300" />
            </p>
          )}
          <button
            onClick={activate}
            disabled={activating}
            className="mt-6 px-6 py-2.5 bg-[#3B6FFF] hover:bg-[#2a56e8] disabled:opacity-50 rounded-xl font-semibold text-sm transition"
          >
            {activating ? "Activating..." : "Activate Companion"}
          </button>
        </div>

        {/* DREAM Simulation */}
        <StudioGate studio="DREAM">
          <div className="bg-[#0E1524] border border-[#1e2d4a] rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-white">✦ DREAM Simulation</h2>
            <textarea
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-[#3B6FFF] text-sm resize-none h-24"
              placeholder="Describe a scenario to simulate..."
              value={simText}
              onChange={(e) => setSimText(e.target.value)}
            />
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={runSim}
                disabled={simRunning || !simText.trim()}
                className="px-5 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded-lg text-sm font-medium transition"
              >
                {simRunning ? "Running..." : "Run Simulation"}
              </button>
              {simResult && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span>{simResult.nodes?.length ?? 0} nodes</span>
                  <GradeChip grade={simResult.grade} />
                </div>
              )}
            </div>
            {simError && <p className="text-red-400 text-sm">{simError}</p>}
            {simResult?.nodes && simResult.nodes.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-gray-500 border-b border-gray-700">
                    <tr>
                      <th className="pb-2 pr-4">Node ID</th>
                      <th className="pb-2 pr-4">Type</th>
                      <th className="pb-2 pr-4">Simulated</th>
                      <th className="pb-2">Output</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {simResult.nodes.map((n) => (
                      <tr key={n.nodeId}>
                        <td className="py-1.5 pr-4 text-gray-300 font-mono">{n.nodeId}</td>
                        <td className="py-1.5 pr-4 text-gray-400">{n.nodeType}</td>
                        <td className="py-1.5 pr-4 text-gray-400">{n.simulated ? "✓" : "–"}</td>
                        <td className="py-1.5 text-gray-500 truncate max-w-xs">
                          {JSON.stringify(n.output ?? "").slice(0, 80)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </StudioGate>

        {/* VISION Automation status */}
        <div className="bg-[#0E1524] border border-[#1e2d4a] rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">VISION Automations</h2>
          {workflows.length === 0 ? (
            <p className="text-gray-500 text-sm">No workflows found.</p>
          ) : (
            <div className="space-y-2">
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-800/50 hover:bg-gray-800 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{wf.name}</p>
                    <div className="flex gap-1 flex-wrap mt-0.5">
                      {wf.tags?.map((t) => (
                        <span
                          key={t}
                          className="text-xs bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded-full"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {wf.executions?.[0] && <StatusChip status={wf.executions[0].status} />}
                  <button
                    onClick={() => navigate(`/workflow/${wf.id}`)}
                    className="text-xs text-[#3B6FFF] hover:underline shrink-0"
                  >
                    View Canvas →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Memory feed */}
        <div className="bg-[#0E1524] border border-[#1e2d4a] rounded-2xl overflow-hidden">
          <button
            onClick={() => setMemoryOpen((o) => !o)}
            className="w-full px-6 py-4 flex items-center justify-between text-sm font-semibold text-white hover:bg-gray-800/30 transition"
          >
            <span>Memory Feed</span>
            <span className="text-gray-400 text-xs">{memoryOpen ? "▲ Collapse" : "▼ Expand"}</span>
          </button>
          {memoryOpen && (
            <div className="px-6 pb-6 max-h-72 overflow-y-auto space-y-3">
              {memory.length === 0 ? (
                <p className="text-gray-500 text-sm">No memory records yet.</p>
              ) : (
                memory.map((m) => (
                  <div key={m.id} className="border-l-2 border-[#3B6FFF]/40 pl-3 py-1">
                    <p className="text-xs text-gray-500 mb-0.5">
                      <TimeAgo date={m.createdAt} />
                    </p>
                    <p className="text-sm text-gray-300 line-clamp-2">{m.content}</p>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {m.tags?.map((t) => (
                        <span key={t} className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
