/**
 * Platform Admin Dashboard
 * Only rendered for users with isAdmin: true in their JWT.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const ADMIN_KEY = import.meta.env.VITE_ADMIN_SECRET_KEY || "";

const adminAxios = axios.create({ baseURL: API_BASE });
adminAxios.interceptors.request.use((cfg) => {
  cfg.headers["x-admin-key"] = ADMIN_KEY;
  return cfg;
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Plan = "FREE" | "STARTER" | "PRO" | "ENTERPRISE" | "BYOK";
type GpuStatus = "ACTIVE" | "PAUSED" | "OFFLINE";

interface Tenant {
  id: string;
  tenantId: string;
  email: string;
  plan: Plan;
  createdAt: string;
  gpuListingCount: number;
}

interface GpuListing {
  id: string;
  label: string;
  gpuModel: string;
  ratePerHour: number;
  status: GpuStatus;
  ownerEmail: string;
}

interface AuditStatus {
  entries: unknown[];
  verified: boolean;
  message: string;
}

type SortField = "plan" | "createdAt";

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminPage() {
  const navigate = useNavigate();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [gpuListings, setGpuListings] = useState<GpuListing[]>([]);
  const [audit, setAudit] = useState<AuditStatus | null>(null);

  const [tenantSort, setTenantSort] = useState<SortField>("createdAt");
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loadingGpu, setLoadingGpu] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetchTenants();
    fetchGpu();
    fetchAudit();
  }, []);

  async function fetchTenants() {
    setLoadingTenants(true);
    try {
      const { data } = await adminAxios.get<Tenant[]>("/admin/tenants");
      setTenants(data);
    } catch (e) {
      setError("Failed to load tenants — check VITE_ADMIN_SECRET_KEY");
    } finally {
      setLoadingTenants(false);
    }
  }

  async function fetchGpu() {
    setLoadingGpu(true);
    try {
      const { data } = await adminAxios.get<GpuListing[]>("/admin/gpu");
      setGpuListings(data);
    } catch {
      // non-critical
    } finally {
      setLoadingGpu(false);
    }
  }

  async function fetchAudit() {
    setLoadingAudit(true);
    try {
      const { data } = await adminAxios.get<AuditStatus>("/admin/audit");
      setAudit(data);
    } catch {
      // non-critical
    } finally {
      setLoadingAudit(false);
    }
  }

  async function updatePlan(userId: string, plan: Plan) {
    try {
      await adminAxios.patch(`/admin/plan/${userId}`, { plan });
      setTenants((prev) =>
        prev.map((t) => (t.id === userId ? { ...t, plan } : t))
      );
    } catch {
      alert("Failed to update plan");
    }
  }

  async function toggleGpuStatus(id: string, current: GpuStatus) {
    const next: GpuStatus = current === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await adminAxios.patch(`/admin/gpu/${id}/status`, { status: next });
      setGpuListings((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: next } : l))
      );
    } catch {
      alert("Failed to toggle GPU status");
    }
  }

  // ── Sorting ────────────────────────────────────────────────────────────────

  const PLAN_ORDER: Record<Plan, number> = {
    FREE: 0, STARTER: 1, PRO: 2, ENTERPRISE: 3, BYOK: 4,
  };

  const sortedTenants = [...tenants].sort((a, b) => {
    if (tenantSort === "plan") return PLAN_ORDER[b.plan] - PLAN_ORDER[a.plan];
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">Platform Admin</h1>
          <span className="bg-red-800/60 text-red-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-red-700">
            Restricted
          </span>
        </div>
        <button
          onClick={() => navigate("/")}
          className="text-sm text-gray-400 hover:text-white transition"
        >
          ← Back to Dashboard
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-12">
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ── Tenants Table ────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Tenants</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Sort:</span>
              <button
                onClick={() => setTenantSort("plan")}
                className={`text-xs px-2 py-1 rounded ${tenantSort === "plan" ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
              >
                Plan
              </button>
              <button
                onClick={() => setTenantSort("createdAt")}
                className={`text-xs px-2 py-1 rounded ${tenantSort === "createdAt" ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
              >
                Created
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Tenant ID</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Plan</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-left px-4 py-3">GPU Listings</th>
                  <th className="text-left px-4 py-3">Override Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loadingTenants ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : sortedTenants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      No tenants found
                    </td>
                  </tr>
                ) : (
                  sortedTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-800/50 transition">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[10rem]">
                        {t.tenantId.slice(0, 12)}…
                      </td>
                      <td className="px-4 py-3 text-gray-200">{t.email}</td>
                      <td className="px-4 py-3">
                        <PlanChip plan={t.plan} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{t.gpuListingCount}</td>
                      <td className="px-4 py-3">
                        <select
                          value={t.plan}
                          onChange={(e) => updatePlan(t.id, e.target.value as Plan)}
                          className="bg-gray-700 border border-gray-600 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                        >
                          {(["FREE", "STARTER", "PRO", "ENTERPRISE", "BYOK"] as Plan[]).map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── GPU Marketplace Overview ─────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold mb-4">GPU Marketplace</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Label</th>
                  <th className="text-left px-4 py-3">GPU Model</th>
                  <th className="text-left px-4 py-3">Owner</th>
                  <th className="text-left px-4 py-3">Rate/hr</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loadingGpu ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">Loading…</td>
                  </tr>
                ) : gpuListings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">No GPU listings</td>
                  </tr>
                ) : (
                  gpuListings.map((g) => (
                    <tr key={g.id} className="hover:bg-gray-800/50 transition">
                      <td className="px-4 py-3 text-gray-200">{g.label}</td>
                      <td className="px-4 py-3 text-gray-300">{g.gpuModel}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{g.ownerEmail}</td>
                      <td className="px-4 py-3 text-green-400">${g.ratePerHour.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <GpuStatusChip status={g.status} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleGpuStatus(g.id, g.status)}
                          className={`text-xs px-2 py-1 rounded transition ${
                            g.status === "ACTIVE"
                              ? "bg-yellow-800/40 hover:bg-yellow-800/60 text-yellow-300"
                              : "bg-green-800/40 hover:bg-green-800/60 text-green-300"
                          }`}
                        >
                          {g.status === "ACTIVE" ? "Pause" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Audit Chain Status ───────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Audit Chain</h2>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            {loadingAudit ? (
              <p className="text-gray-500 text-sm">Loading…</p>
            ) : audit ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">Entries:</span>
                  <span className="font-mono text-white">{audit.entries.length}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">Verified:</span>
                  <span className={audit.verified ? "text-green-400" : "text-red-400"}>
                    {audit.verified ? "✓ true" : "✗ false"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">Note:</span>
                  <span className="text-gray-300 italic">{audit.message}</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Failed to load audit status</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

// ── Helper chips ───────────────────────────────────────────────────────────────

function PlanChip({ plan }: { plan: Plan }) {
  const color: Record<Plan, string> = {
    FREE: "bg-gray-700 text-gray-300",
    STARTER: "bg-blue-900/50 text-blue-300",
    PRO: "bg-purple-900/50 text-purple-300",
    ENTERPRISE: "bg-yellow-900/50 text-yellow-300",
    BYOK: "bg-green-900/50 text-green-300",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color[plan]}`}>{plan}</span>
  );
}

function GpuStatusChip({ status }: { status: GpuStatus }) {
  const color: Record<GpuStatus, string> = {
    ACTIVE: "bg-green-900/50 text-green-400",
    PAUSED: "bg-yellow-900/50 text-yellow-400",
    OFFLINE: "bg-gray-700 text-gray-400",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color[status]}`}>{status}</span>
  );
}
