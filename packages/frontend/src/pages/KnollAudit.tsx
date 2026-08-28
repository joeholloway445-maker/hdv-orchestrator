/**
 * KNOLL Security Audit Page
 * Shows the AuditHashChain verdicts with tamper-evident chain integrity display.
 * Admins see the full chain via GET /admin/audit.
 * ENTERPRISE+ users see their tenant-scoped chain via GET /knoll/audit.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuthStore } from "../store/auth";
import { StudioGate } from "../components/StudioGate";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const ADMIN_KEY = import.meta.env.VITE_ADMIN_SECRET_KEY || "";

// ── Types ──────────────────────────────────────────────────────────────────────

type Verdict = "PASS" | "BLOCK" | "WARN";

interface AuditEntry {
  index: number;
  timestamp: string;
  nodeId: string;
  verdict: Verdict;
  tenantId: string;
  hash: string;
  prevHash: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  verified: boolean;
  tenantId?: string;
  message?: string;
}

// ── Helper components ──────────────────────────────────────────────────────────

function VerdictChip({ verdict }: { verdict: Verdict }) {
  const styles: Record<Verdict, string> = {
    PASS: "bg-green-900/50 text-green-400 border border-green-800",
    BLOCK: "bg-red-900/50 text-red-400 border border-red-800",
    WARN: "bg-yellow-900/50 text-yellow-400 border border-yellow-800",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles[verdict]}`}>
      {verdict}
    </span>
  );
}

function truncateHash(hash: string): string {
  if (!hash || hash.length <= 16) return hash;
  return `${hash.slice(0, 16)}...`;
}

// ── Main component ─────────────────────────────────────────────────────────────

function KnollAuditContent() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = Boolean(user?.isAdmin);

  const [auditData, setAuditData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let data: AuditResponse;
      if (isAdmin) {
        const response = await api.get<AuditResponse>(`${API_BASE}/admin/audit`, {
          headers: { "x-admin-key": ADMIN_KEY },
        });
        data = response.data;
      } else {
        const response = await api.get<AuditResponse>("/knoll/audit");
        data = response.data;
      }
      setAuditData(data);
      setLastRefreshed(new Date());
    } catch (e) {
      setError("Failed to load audit chain. Check permissions or API connectivity.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  // Initial fetch
  useEffect(() => {
    void fetchAudit();
  }, [fetchAudit]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      void fetchAudit();
    }, 30_000);
    return () => clearInterval(intervalId);
  }, [fetchAudit]);

  const entries: AuditEntry[] = auditData?.entries ?? [];
  const verified = auditData?.verified ?? true;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">KNOLL Security Audit</h1>
          <span className="bg-indigo-900/60 text-indigo-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-indigo-700">
            ENTERPRISE
          </span>
        </div>
        <div className="flex items-center gap-4">
          {lastRefreshed && (
            <span className="text-xs text-gray-500">
              Refreshed {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => void fetchAudit()}
            disabled={loading}
            className="text-sm px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition font-medium"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={() => navigate("/")}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Page subtitle */}
        <div>
          <p className="text-gray-400 text-sm">
            Tamper-evident verdict chain powered by SHA-256
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Chain Status banner */}
        <section className="bg-gray-800 border border-gray-700 rounded-xl px-6 py-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Chain Status
          </h2>
          {loading && !auditData ? (
            <p className="text-gray-500 text-sm">Loading chain status…</p>
          ) : auditData ? (
            <div className="flex flex-wrap items-center gap-6">
              {/* Integrity badge */}
              <div className="flex items-center gap-2">
                {verified ? (
                  <span className="inline-flex items-center gap-1.5 bg-green-900/50 border border-green-700 text-green-400 text-sm font-semibold px-3 py-1 rounded-full">
                    <span>✓</span> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-red-900/50 border border-red-700 text-red-400 text-sm font-semibold px-3 py-1 rounded-full">
                    <span>⚠</span> Unverified
                  </span>
                )}
              </div>

              {/* Entry count */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">Total Entries:</span>
                <span className="font-mono text-white font-semibold">{entries.length}</span>
              </div>

              {/* Chain integrity label */}
              <div className="flex items-center gap-2 text-sm font-semibold">
                {verified ? (
                  <span className="text-green-400">Chain Integrity: Verified ✓</span>
                ) : (
                  <span className="text-red-400">⚠ Chain Tampered</span>
                )}
              </div>

              {/* Tenant scope note for non-admin */}
              {!isAdmin && auditData.tenantId && (
                <div className="ml-auto text-xs text-gray-500 font-mono">
                  Tenant: {auditData.tenantId.slice(0, 12)}…
                </div>
              )}
            </div>
          ) : null}

          {auditData?.message && (
            <p className="mt-3 text-xs text-gray-500 italic">{auditData.message}</p>
          )}
        </section>

        {/* Audit Log table */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Audit Log</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3 w-12">#</th>
                  <th className="text-left px-4 py-3">Timestamp</th>
                  <th className="text-left px-4 py-3">Node ID</th>
                  <th className="text-left px-4 py-3">Verdict</th>
                  <th className="text-left px-4 py-3">Tenant</th>
                  <th className="text-left px-4 py-3">Hash</th>
                  <th className="text-left px-4 py-3">Prev Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading && entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Loading audit entries…
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No audit entries found.{" "}
                      {auditData?.message && (
                        <span className="italic">{auditData.message}</span>
                      )}
                    </td>
                  </tr>
                ) : (
                  entries.map((entry, idx) => (
                    <tr key={entry.hash || idx} className="hover:bg-gray-800/50 transition">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {entry.index ?? idx + 1}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                        {entry.timestamp
                          ? new Date(entry.timestamp).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 max-w-[8rem] truncate">
                        {entry.nodeId || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {entry.verdict ? (
                          <VerdictChip verdict={entry.verdict} />
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 max-w-[8rem] truncate">
                        {entry.tenantId ? `${entry.tenantId.slice(0, 12)}…` : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-300">
                        {entry.hash ? truncateHash(entry.hash) : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {entry.prevHash ? truncateHash(entry.prevHash) : "genesis"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

// ── Page export — non-admin users are gated behind StudioGate ──────────────────

export function KnollAuditPage() {
  const user = useAuthStore((s) => s.user);

  if (user?.isAdmin) {
    return <KnollAuditContent />;
  }

  return (
    <StudioGate studio="KNOLL">
      <KnollAuditContent />
    </StudioGate>
  );
}
