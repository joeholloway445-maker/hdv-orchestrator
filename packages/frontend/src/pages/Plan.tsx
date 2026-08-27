import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { usePlan } from "../context/plan";
import type { SubscriptionPlan } from "../context/plan";

interface PlanTier {
  id: SubscriptionPlan;
  label: string;
  price: string;
  studios: string[];
  badgeClass: string;
  buttonClass: string;
}

const TIERS: PlanTier[] = [
  {
    id: "FREE",
    label: "Free",
    price: "$0 / mo",
    studios: [],
    badgeClass: "bg-gray-700 text-gray-300",
    buttonClass: "bg-gray-700 hover:bg-gray-600 text-gray-300",
  },
  {
    id: "STARTER",
    label: "Starter",
    price: "$29 / mo",
    studios: ["DREAM"],
    badgeClass: "bg-blue-900/60 text-blue-300",
    buttonClass: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  {
    id: "PRO",
    label: "Pro",
    price: "$79 / mo",
    studios: ["DREAM", "VISION"],
    badgeClass: "bg-purple-900/60 text-purple-300",
    buttonClass: "bg-purple-700 hover:bg-purple-600 text-white",
  },
  {
    id: "ENTERPRISE",
    label: "Enterprise",
    price: "Custom",
    studios: ["DREAM", "VISION", "KNOLL", "APEX"],
    badgeClass: "bg-amber-900/60 text-amber-300",
    buttonClass: "bg-amber-700 hover:bg-amber-600 text-white",
  },
  {
    id: "BYOK",
    label: "BYOK",
    price: "$19 / mo",
    studios: ["DREAM", "VISION"],
    badgeClass: "bg-emerald-900/60 text-emerald-300",
    buttonClass: "bg-emerald-700 hover:bg-emerald-600 text-white",
  },
];

const ALL_STUDIOS = ["DREAM", "VISION", "KNOLL", "APEX"];

const STUDIO_DESCRIPTIONS: Record<string, string> = {
  DREAM: "Generative image & video studio",
  VISION: "Vision analysis & multimodal agent",
  KNOLL: "Enterprise compute orchestration",
  APEX: "Full-autonomy agent runtime",
};

export function PlanPage() {
  const navigate = useNavigate();
  const { plan, refresh } = usePlan();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectPlan(newPlan: SubscriptionPlan) {
    if (newPlan === plan) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch("/plan", { plan: newPlan });
      refresh();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to update plan";
      setError(msg);
    } finally {
      setSaving(false);
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
        <h1 className="text-xl font-bold">Subscription Plan</h1>
        {plan && (
          <span className="ml-auto text-sm text-gray-400">
            Current plan:{" "}
            <span className="text-white font-semibold">{plan}</span>
          </span>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Studio access map */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Studio Access</h2>
          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Studio</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  {TIERS.map((t) => (
                    <th key={t.id} className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${t.badgeClass}`}>
                        {t.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_STUDIOS.map((studio) => (
                  <tr
                    key={studio}
                    className="border-b border-gray-700/50 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">{studio}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {STUDIO_DESCRIPTIONS[studio]}
                    </td>
                    {TIERS.map((t) => (
                      <td key={t.id} className="px-4 py-3 text-center">
                        {t.studios.includes(studio) ? (
                          <span className="text-green-400 text-base" title="Included">
                            ✓
                          </span>
                        ) : (
                          <span className="text-gray-600 text-base" title="Not included">
                            –
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Plan selector */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Choose a Plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {TIERS.map((tier) => {
              const isCurrent = plan === tier.id;
              return (
                <div
                  key={tier.id}
                  className={`bg-gray-800 border rounded-xl p-5 flex flex-col gap-3 transition ${
                    isCurrent
                      ? "border-blue-500 ring-1 ring-blue-500"
                      : "border-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${tier.badgeClass}`}
                    >
                      {tier.label}
                    </span>
                    {isCurrent && (
                      <span className="text-xs text-blue-400 font-medium">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold">{tier.price}</p>
                  <div className="flex-1 space-y-1">
                    {tier.studios.length === 0 ? (
                      <p className="text-xs text-gray-500">No studio access</p>
                    ) : (
                      tier.studios.map((s) => (
                        <p key={s} className="text-xs text-gray-400 flex items-center gap-1">
                          <span className="text-green-400">✓</span> {s}
                        </p>
                      ))
                    )}
                  </div>
                  <button
                    onClick={() => selectPlan(tier.id)}
                    disabled={isCurrent || saving}
                    className={`w-full py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${tier.buttonClass}`}
                  >
                    {isCurrent ? "Current Plan" : saving ? "Saving…" : "Select"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Plan changes take effect immediately. Contact sales for Enterprise pricing.
          </p>
        </section>

        {/* GPU Marketplace link */}
        <section className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="font-semibold">GPU Marketplace</p>
            <p className="text-sm text-gray-400 mt-0.5">
              List or rent GPU compute at your own rate
            </p>
          </div>
          <button
            onClick={() => navigate("/gpu")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
          >
            Open Marketplace →
          </button>
        </section>
      </main>
    </div>
  );
}
