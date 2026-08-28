import { useEffect, useState } from "react";
import { useAuthStore } from "../store/auth";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

interface ProfileData {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string | null;
  emailNotifications: boolean;
  plan: string;
  byokBaseUrl: string | null;
  byokModel: string | null;
}

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

export function ProfilePage() {
  const token = useAuthStore((s) => s.token);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    timezone: "UTC",
    emailNotifications: true,
    byokBaseUrl: "",
    byokApiKey: "",
    byokModel: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: ProfileData) => {
        setProfile(data);
        setForm({
          displayName: data.displayName || "",
          timezone: data.timezone || "UTC",
          emailNotifications: data.emailNotifications,
          byokBaseUrl: data.byokBaseUrl || "",
          byokApiKey: "",
          byokModel: data.byokModel || "",
        });
      })
      .catch(() => setError("Failed to load profile"));
  }, [token]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch(`${API}/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
      const updated = await res.json();
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const PLAN_COLOR: Record<string, string> = {
    FREE: "text-gray-400",
    STARTER: "text-blue-400",
    PRO: "text-purple-400",
    ENTERPRISE: "text-yellow-400",
    BYOK: "text-green-400",
  };

  return (
    <div className="min-h-screen bg-[#060A14] text-white">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Profile & Settings</h1>
        <p className="text-gray-500 text-sm mb-8">
          Manage your account, preferences, and BYOK configuration.
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-700/50 text-red-300 text-sm px-4 py-3 rounded-xl mb-6">
            {error}
          </div>
        )}

        {/* Account info */}
        <section className="bg-[#0E1524] border border-white/5 rounded-2xl p-6 mb-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Account
          </h2>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <div className="bg-[#060A14] border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-sm">
              {profile?.email || "—"}
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Plan</label>
            <div className={`text-sm font-semibold ${PLAN_COLOR[profile?.plan || "FREE"]}`}>
              {profile?.plan || "FREE"}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Display Name</label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Your name"
              maxLength={64}
              className="w-full bg-[#060A14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3B6FFF]/50"
            />
          </div>
        </section>

        {/* Preferences */}
        <section className="bg-[#0E1524] border border-white/5 rounded-2xl p-6 mb-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Preferences
          </h2>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Timezone</label>
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="w-full bg-[#060A14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3B6FFF]/50"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white">Email notifications</div>
              <div className="text-xs text-gray-500">
                Receive alerts for workflow failures and completions
              </div>
            </div>
            <button
              onClick={() =>
                setForm({ ...form, emailNotifications: !form.emailNotifications })
              }
              className={`relative w-11 h-6 rounded-full transition-colors ${
                form.emailNotifications ? "bg-[#3B6FFF]" : "bg-gray-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  form.emailNotifications ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </section>

        {/* BYOK */}
        <section className="bg-[#0E1524] border border-white/5 rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-1">
            BYOK — Bring Your Own Keys
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Point HDV at your own OpenAI-compatible endpoint. Leave blank to use
            platform defaults.
          </p>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Base URL</label>
            <input
              type="text"
              value={form.byokBaseUrl}
              onChange={(e) => setForm({ ...form, byokBaseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-[#060A14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3B6FFF]/50"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">
              API Key <span className="text-gray-600">(leave blank to keep existing)</span>
            </label>
            <input
              type="password"
              value={form.byokApiKey}
              onChange={(e) => setForm({ ...form, byokApiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full bg-[#060A14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3B6FFF]/50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Model ID</label>
            <input
              type="text"
              value={form.byokModel}
              onChange={(e) => setForm({ ...form, byokModel: e.target.value })}
              placeholder="gpt-4o"
              className="w-full bg-[#060A14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3B6FFF]/50"
            />
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#3B6FFF] hover:bg-[#2558e8] disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-medium transition-colors text-sm"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {saved && (
            <span className="text-green-400 text-sm">Saved successfully</span>
          )}
        </div>
      </div>
    </div>
  );
}
