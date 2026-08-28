// GPU Marketplace — browse available GPUs and list your own
// StudioGate wraps the "List My GPU" form (ENTERPRISE+)
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { StudioGate } from "../components/StudioGate";

type GpuStatus = "ACTIVE" | "PAUSED" | "AVAILABLE" | "BUSY" | "OFFLINE";

interface GpuListing {
  id: string;
  label: string;
  gpuModel: string;
  vramGb?: number;
  ratePerHour: number;
  endpointUrl: string;
  status: GpuStatus;
  provider?: string;
  createdAt: string;
  user?: { email: string };
}

interface ListingForm {
  label: string;
  gpuModel: string;
  ratePerHour: string;
  endpointUrl: string;
}

const EMPTY_FORM: ListingForm = {
  label: "",
  gpuModel: "",
  ratePerHour: "",
  endpointUrl: "",
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-900/40 text-green-400",
  AVAILABLE: "bg-green-900/40 text-green-400",
  PAUSED: "bg-yellow-900/40 text-yellow-400",
  BUSY: "bg-yellow-900/40 text-yellow-400",
  OFFLINE: "bg-gray-700 text-gray-400",
};

export function GpuMarketplacePage() {
  const navigate = useNavigate();

  const [listings, setListings] = useState<GpuListing[]>([]);
  const [mine, setMine] = useState<GpuListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadingMine, setLoadingMine] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ListingForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchListings();
    fetchMine();
  }, []);

  function fetchListings() {
    setLoadingListings(true);
    api
      .get<GpuListing[]>("/gpu")
      .then(({ data }) => setListings(data))
      .catch(() => {})
      .finally(() => setLoadingListings(false));
  }

  function fetchMine() {
    setLoadingMine(true);
    api
      .get<GpuListing[]>("/gpu/mine")
      .then(({ data }) => setMine(data))
      .catch(() => {})
      .finally(() => setLoadingMine(false));
  }

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function submitListing() {
    setFormError(null);
    if (!form.label.trim()) {
      setFormError("Label is required");
      return;
    }
    if (!form.gpuModel.trim()) {
      setFormError("GPU model is required");
      return;
    }
    const ratePerHour = Number(form.ratePerHour);
    if (!Number.isFinite(ratePerHour) || ratePerHour < 0) {
      setFormError("Rate per hour must be a non-negative number");
      return;
    }
    if (!form.endpointUrl.trim()) {
      setFormError("Endpoint URL is required");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/gpu", {
        label: form.label.trim(),
        gpuModel: form.gpuModel.trim(),
        ratePerHour,
        endpointUrl: form.endpointUrl.trim(),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      fetchListings();
      fetchMine();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to create listing";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(listing: GpuListing) {
    const isActive =
      listing.status === "ACTIVE" || listing.status === "AVAILABLE";
    const nextStatus: GpuStatus = isActive ? "PAUSED" : "ACTIVE";
    try {
      await api.patch(`/gpu/${listing.id}/status`, { status: nextStatus });
      const updater = (prev: GpuListing[]) =>
        prev.map((m) =>
          m.id === listing.id ? { ...m, status: nextStatus } : m
        );
      setMine(updater);
      setListings(updater);
    } catch {
      // ignore
    }
  }

  const activeListings = listings.filter(
    (l) => l.status === "ACTIVE" || l.status === "AVAILABLE"
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white text-sm transition"
        >
          ← Dashboard
        </button>
        <h1 className="text-xl font-bold">GPU Marketplace</h1>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => navigate("/plan")}
            className="text-gray-400 hover:text-white text-sm transition"
          >
            My Plan
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
          >
            + List My GPU
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-12">
        {/* ── List Your GPU (ENTERPRISE gate) ─────────────────────── */}
        {showForm && (
          <section>
            <h2 className="text-lg font-semibold mb-4">List Your GPU</h2>
            <StudioGate studio="KNOLL">
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">
                      Label *
                    </label>
                    <input
                      name="label"
                      value={form.label}
                      onChange={handleFormChange}
                      placeholder="e.g. RTX 4090 Node A"
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">
                      GPU Model *
                    </label>
                    <input
                      name="gpuModel"
                      value={form.gpuModel}
                      onChange={handleFormChange}
                      placeholder="e.g. RTX 4090"
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">
                      Rate Per Hour ($) *
                    </label>
                    <input
                      name="ratePerHour"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.ratePerHour}
                      onChange={handleFormChange}
                      placeholder="1.50"
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">
                      Endpoint URL *
                    </label>
                    <input
                      name="endpointUrl"
                      value={form.endpointUrl}
                      onChange={handleFormChange}
                      placeholder="http://myserver:11434"
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {formError && (
                  <p className="text-red-400 text-xs mt-3">{formError}</p>
                )}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={submitListing}
                    disabled={submitting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition disabled:opacity-50"
                  >
                    {submitting ? "Submitting…" : "Submit Listing"}
                  </button>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setForm(EMPTY_FORM);
                      setFormError(null);
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </StudioGate>
          </section>
        )}

        {/* ── My Listings ──────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold mb-4">My Listings</h2>
          {loadingMine ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : mine.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center text-gray-500">
              <p className="text-sm">You have no GPU listings yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-blue-400 hover:underline text-sm"
              >
                List your first GPU →
              </button>
            </div>
          ) : (
            <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Label</th>
                    <th className="px-4 py-3 text-left">GPU Model</th>
                    <th className="px-4 py-3 text-right">$/hr</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Toggle</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((listing) => (
                    <tr
                      key={listing.id}
                      className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30 transition"
                    >
                      <td className="px-4 py-3 font-medium">{listing.label}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {listing.gpuModel}
                      </td>
                      <td className="px-4 py-3 text-right text-green-400 font-medium">
                        ${listing.ratePerHour.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[listing.status] ?? "bg-gray-700 text-gray-400"}`}
                        >
                          {listing.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleStatus(listing)}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs transition"
                        >
                          {listing.status === "ACTIVE" ||
                          listing.status === "AVAILABLE"
                            ? "Pause"
                            : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Available GPU Listings ───────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Available GPUs</h2>
          {loadingListings ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : activeListings.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center text-gray-500">
              <p className="text-sm">No GPU providers available yet.</p>
            </div>
          ) : (
            <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Label</th>
                    <th className="px-4 py-3 text-left">GPU Model</th>
                    <th className="px-4 py-3 text-left">Provider</th>
                    <th className="px-4 py-3 text-right">Rate/hr</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Workflow</th>
                  </tr>
                </thead>
                <tbody>
                  {activeListings.map((listing) => (
                    <tr
                      key={listing.id}
                      className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30 transition"
                    >
                      <td className="px-4 py-3 font-medium">{listing.label}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {listing.gpuModel}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-[140px]">
                        {listing.provider ?? listing.user?.email ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-green-400 font-medium">
                        ${listing.ratePerHour.toFixed(2)}/hr
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[listing.status] ?? "bg-gray-700 text-gray-400"}`}
                        >
                          {listing.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                          Use in Workflow
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
