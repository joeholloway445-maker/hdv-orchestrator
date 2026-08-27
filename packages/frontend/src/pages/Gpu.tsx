import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

type GpuStatus = "AVAILABLE" | "BUSY" | "OFFLINE";

interface GpuListing {
  id: string;
  label: string;
  gpuModel: string;
  vramGb: number;
  ratePerHour: number;
  endpointUrl: string;
  status: GpuStatus;
  createdAt: string;
  user?: { email: string };
}

interface ListingForm {
  label: string;
  gpuModel: string;
  vramGb: string;
  ratePerHour: string;
  endpointUrl: string;
  apiKey: string;
}

const EMPTY_FORM: ListingForm = {
  label: "",
  gpuModel: "",
  vramGb: "",
  ratePerHour: "",
  endpointUrl: "",
  apiKey: "",
};

const STATUS_STYLES: Record<GpuStatus, string> = {
  AVAILABLE: "bg-green-900/40 text-green-400",
  BUSY: "bg-yellow-900/40 text-yellow-400",
  OFFLINE: "bg-gray-700 text-gray-400",
};

const NEXT_STATUS: Record<GpuStatus, GpuStatus> = {
  AVAILABLE: "OFFLINE",
  BUSY: "OFFLINE",
  OFFLINE: "AVAILABLE",
};

export function GpuPage() {
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

  function handleFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function submitListing() {
    setFormError(null);
    if (!form.label.trim()) { setFormError("Label is required"); return; }
    if (!form.gpuModel.trim()) { setFormError("GPU model is required"); return; }
    const vramGb = Number(form.vramGb);
    if (!Number.isFinite(vramGb) || vramGb <= 0) {
      setFormError("VRAM must be a positive number");
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
      const body: Record<string, unknown> = {
        label: form.label.trim(),
        gpuModel: form.gpuModel.trim(),
        vramGb,
        ratePerHour,
        endpointUrl: form.endpointUrl.trim(),
      };
      if (form.apiKey.trim()) body.apiKey = form.apiKey.trim();
      await api.post("/gpu", body);
      setForm(EMPTY_FORM);
      setShowForm(false);
      fetchMine();
      fetchListings();
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
    const nextStatus = NEXT_STATUS[listing.status];
    try {
      await api.patch(`/gpu/${listing.id}/status`, { status: nextStatus });
      setMine((prev) =>
        prev.map((m) =>
          m.id === listing.id ? { ...m, status: nextStatus } : m
        )
      );
      setListings((prev) =>
        prev.map((l) =>
          l.id === listing.id ? { ...l, status: nextStatus } : l
        )
      );
    } catch {
      // ignore
    }
  }

  async function deleteListing(id: string) {
    if (!confirm("Delete this GPU listing?")) return;
    try {
      await api.delete(`/gpu/${id}`);
      setMine((prev) => prev.filter((m) => m.id !== id));
      setListings((prev) => prev.filter((l) => l.id !== id));
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
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

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {/* List GPU form */}
        {showForm && (
          <section className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <h2 className="font-semibold text-lg mb-4">List My GPU</h2>
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
                  placeholder="e.g. NVIDIA RTX 4090"
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  VRAM (GB) *
                </label>
                <input
                  name="vramGb"
                  type="number"
                  min={0}
                  value={form.vramGb}
                  onChange={handleFormChange}
                  placeholder="24"
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  Rate ($/hr) *
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
              <div className="sm:col-span-2">
                <label className="text-gray-400 text-xs mb-1 block">
                  Endpoint URL *
                </label>
                <input
                  name="endpointUrl"
                  value={form.endpointUrl}
                  onChange={handleFormChange}
                  placeholder="https://my-gpu.example.com/v1"
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-gray-400 text-xs mb-1 block">
                  API Key (optional)
                </label>
                <input
                  name="apiKey"
                  type="password"
                  value={form.apiKey}
                  onChange={handleFormChange}
                  placeholder="sk-…"
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
          </section>
        )}

        {/* My Listings */}
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
            <div className="space-y-3">
              {mine.map((listing) => (
                <div
                  key={listing.id}
                  className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{listing.label}</p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[listing.status]}`}
                      >
                        {listing.status}
                      </span>
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {listing.gpuModel} · {listing.vramGb} GB VRAM ·{" "}
                      <span className="text-green-400 font-medium">
                        ${listing.ratePerHour.toFixed(2)}/hr
                      </span>
                    </p>
                    <p className="text-gray-600 text-xs mt-0.5 truncate">
                      {listing.endpointUrl}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => toggleStatus(listing)}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs transition"
                      title={
                        listing.status === "OFFLINE"
                          ? "Set online"
                          : "Set offline"
                      }
                    >
                      {listing.status === "OFFLINE" ? "Go Online" : "Go Offline"}
                    </button>
                    <button
                      onClick={() => deleteListing(listing.id)}
                      className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-xs transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Available GPU Marketplace */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Available GPUs</h2>
          {loadingListings ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : listings.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center text-gray-500">
              <p className="text-sm">No GPU listings in the marketplace yet.</p>
            </div>
          ) : (
            <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Label</th>
                    <th className="px-4 py-3 text-left">GPU Model</th>
                    <th className="px-4 py-3 text-right">VRAM</th>
                    <th className="px-4 py-3 text-right">$/hr</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Listed by</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((listing) => (
                    <tr
                      key={listing.id}
                      className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30 transition"
                    >
                      <td className="px-4 py-3 font-medium">{listing.label}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {listing.gpuModel}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {listing.vramGb} GB
                      </td>
                      <td className="px-4 py-3 text-right text-green-400 font-medium">
                        ${listing.ratePerHour.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[listing.status]}`}
                        >
                          {listing.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[160px]">
                        {listing.user?.email ?? "—"}
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
