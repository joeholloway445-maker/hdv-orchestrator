import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { usePlan } from "../context/plan";
import type { SubscriptionPlan } from "../context/plan";
import { useAuthStore } from "../store/auth";

interface PlanTierDef {
  id: SubscriptionPlan;
  label: string;
  price: string;
  priceMonthly: number;
  features: string[];
  badgeClass: string;
  highlightClass: string;
}

const TIERS: PlanTierDef[] = [
  {
    id: "FREE",
    label: "Free",
    price: "$0/mo",
    priceMonthly: 0,
    features: ["Canvas access", "Basic workflows", "HOPE companion"],
    badgeClass: "bg-gray-700 text-gray-300",
    highlightClass: "border-gray-600",
  },
  {
    id: "STARTER",
    label: "Starter",
    price: "$9/mo",
    priceMonthly: 9,
    features: ["Everything in Free", "DREAM simulation", "10 workflows"],
    badgeClass: "bg-blue-900/60 text-blue-300",
    highlightClass: "border-blue-500",
  },
  {
    id: "PRO",
    label: "Pro",
    price: "$29/mo",
    priceMonthly: 29,
    features: ["Everything in Starter", "VISION automations", "100 workflows", "Webhook triggers"],
    badgeClass: "bg-purple-900/60 text-purple-300",
    highlightClass: "border-purple-500",
  },
  {
    id: "ENTERPRISE",
    label: "Enterprise",
    price: "$99/mo",
    priceMonthly: 99,
    features: [
      "Everything in Pro",
      "KNOLL security sentinel",
      "APEX MoE routing",
      "GPU marketplace",
      "Unlimited workflows",
    ],
    badgeClass: "bg-amber-900/60 text-amber-300",
    highlightClass: "border-amber-500",
  },
  {
    id: "BYOK",
    label: "BYOK",
    price: "$199/mo",
    priceMonthly: 199,
    features: [
      "Everything in Enterprise",
      "Bring your own LLM endpoint",
      "Custom model routing",
      "Full API control",
    ],
    badgeClass: "bg-emerald-900/60 text-emerald-300",
    highlightClass: "border-emerald-500",
  },
];

const PLAN_ORDER: SubscriptionPlan[] = ["FREE", "STARTER", "PRO", "ENTERPRISE", "BYOK"];

function planRank(p: SubscriptionPlan | null): number {
  if (!p) return -1;
  return PLAN_ORDER.indexOf(p);
}

interface WalletData {
  balanceCents: number;
  currency: string;
}

export function SubscriptionPage() {
  const navigate = useNavigate();
  const { plan, refresh } = usePlan();
  const token = useAuthStore((s) => s.token);

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState(false);

  const [upgrading, setUpgrading] = useState<SubscriptionPlan | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState<string | null>(null);

  // BYOK config
  const [byokEndpoint, setByokEndpoint] = useState("");
  const [byokApiKey, setByokApiKey] = useState("");
  const [byokModel, setByokModel] = useState("");
  const [byokSaving, setByokSaving] = useState(false);
  const [byokError, setByokError] = useState<string | null>(null);
  const [byokSuccess, setByokSuccess] = useState(false);

  useEffect(() => {
    if (!token) return;
    setWalletLoading(true);
    api
      .get<WalletData>("/wallet")
      .then(({ data }) => setWallet(data))
      .catch(() => {})
      .finally(() => setWalletLoading(false));
  }, [token, depositSuccess]);

  async function handleSubscribe(tier: SubscriptionPlan) {
    if (tier === plan) return;
    setUpgrading(tier);
    setUpgradeError(null);
    setUpgradeSuccess(null);
    try {
      await api.post("/membership/subscribe", { tier: tier.toLowerCase() });
      // Also update the plan context via /plan endpoint
      try {
        await api.patch("/plan", { plan: tier });
      } catch {
        // ignore — membership update is the source of truth
      }
      refresh();
      setUpgradeSuccess(`Successfully switched to ${tier} plan.`);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        "Failed to update subscription";
      setUpgradeError(msg);
    } finally {
      setUpgrading(null);
    }
  }

  async function handleDeposit() {
    const cents = Math.round(parseFloat(depositAmount) * 100);
    if (isNaN(cents) || cents <= 0) {
      setDepositError("Enter a valid amount greater than $0");
      return;
    }
    setDepositLoading(true);
    setDepositError(null);
    setDepositSuccess(false);
    try {
      await api.post("/wallet/deposit", { amountCents: cents });
      setDepositSuccess(true);
      setDepositAmount("");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        "Deposit failed";
      setDepositError(msg);
    } finally {
      setDepositLoading(false);
    }
  }

  async function handleByokSave() {
    if (!byokEndpoint || !byokApiKey) {
      setByokError("Endpoint URL and API Key are required");
      return;
    }
    setByokSaving(true);
    setByokError(null);
    setByokSuccess(false);
    try {
      await api.patch("/auth/byok", {
        byokBaseUrl: byokEndpoint,
        byokApiKey,
        byokModel: byokModel || undefined,
      });
      setByokSuccess(true);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        "Failed to save BYOK configuration";
      setByokError(msg);
    } finally {
      setByokSaving(false);
    }
  }

  const currentRank = planRank(plan);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white text-sm transition"
        >
          ← Dashboard
        </button>
        <h1 className="text-xl font-bold">Subscription &amp; Plans</h1>
        {plan && (
          <span className="ml-auto text-sm text-gray-400">
            Current plan:{" "}
            <span className="text-white font-semibold">{plan}</span>
          </span>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        {/* Alerts */}
        {upgradeError && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-red-400 text-sm">
            {upgradeError}
          </div>
        )}
        {upgradeSuccess && (
          <div className="bg-green-900/30 border border-green-700 rounded-xl px-4 py-3 text-green-400 text-sm">
            {upgradeSuccess}
          </div>
        )}

        {/* Current Plan Summary */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Current Plan</h2>
          <div className="bg-[#0E1524] border border-[#1e2d4a] rounded-xl p-6 flex flex-wrap gap-6 items-start">
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Active Plan</p>
              {plan ? (
                <p className="text-2xl font-bold text-white">{plan}</p>
              ) : (
                <p className="text-2xl font-bold text-gray-500">Loading…</p>
              )}
              {plan && (
                <p className="text-sm text-gray-400 mt-1">
                  {TIERS.find((t) => t.id === plan)?.price ?? ""}
                </p>
              )}
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Wallet Balance</p>
              {walletLoading ? (
                <p className="text-2xl font-bold text-gray-500">—</p>
              ) : wallet ? (
                <p className="text-2xl font-bold text-white">
                  ${(wallet.balanceCents / 100).toFixed(2)}
                  <span className="text-sm text-gray-400 font-normal ml-1">
                    {wallet.currency?.toUpperCase() ?? "USD"}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-gray-500">Wallet unavailable</p>
              )}
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Next Billing</p>
              <p className="text-sm text-gray-400">
                {plan === "FREE"
                  ? "No billing — free plan"
                  : "Billed monthly · renews automatically"}
              </p>
            </div>
          </div>
        </section>

        {/* Plan Cards */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {TIERS.map((tier) => {
              const isCurrent = plan === tier.id;
              const tierRank = planRank(tier.id);
              const isUpgrade = tierRank > currentRank;
              const isDowngrade = tierRank < currentRank && !isCurrent;
              const isProcessing = upgrading === tier.id;

              let buttonLabel = "Select";
              if (isCurrent) buttonLabel = "Current";
              else if (isUpgrade) buttonLabel = "Upgrade";
              else if (isDowngrade) buttonLabel = "Downgrade";
              if (isProcessing) buttonLabel = "Processing…";

              let buttonClass =
                "w-full py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ";
              if (isCurrent) {
                buttonClass += "bg-gray-700 text-gray-400 cursor-default";
              } else if (isUpgrade) {
                buttonClass += "bg-blue-600 hover:bg-blue-700 text-white";
              } else {
                buttonClass += "bg-gray-700 hover:bg-gray-600 text-gray-300";
              }

              return (
                <div
                  key={tier.id}
                  className={`bg-gray-800 border rounded-xl p-5 flex flex-col gap-3 transition ${
                    isCurrent
                      ? `${tier.highlightClass} ring-1 ring-current`
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
                      <span className="text-xs text-green-400 font-medium">✓ Active</span>
                    )}
                  </div>
                  <p className="text-2xl font-bold">{tier.price}</p>
                  <div className="flex-1 space-y-1">
                    {tier.features.map((f) => (
                      <p key={f} className="text-xs text-gray-400 flex items-start gap-1">
                        <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                        {f}
                      </p>
                    ))}
                  </div>
                  <button
                    onClick={() => handleSubscribe(tier.id)}
                    disabled={isCurrent || isProcessing || upgrading !== null}
                    className={buttonClass}
                  >
                    {buttonLabel}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Plan changes take effect immediately. Contact sales for custom Enterprise pricing.
          </p>
        </section>

        {/* BYOK Configuration — only for BYOK plan users */}
        {plan === "BYOK" && (
          <section>
            <h2 className="text-lg font-semibold mb-4">BYOK Configuration</h2>
            <div className="bg-[#0E1524] border border-[#1e2d4a] rounded-xl p-6 space-y-4">
              <p className="text-sm text-gray-400">
                Configure your custom OpenAI-compatible LLM endpoint. Your API key is stored
                securely server-side.
              </p>
              {byokError && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 text-red-400 text-sm">
                  {byokError}
                </div>
              )}
              {byokSuccess && (
                <div className="bg-green-900/30 border border-green-700 rounded-lg px-4 py-2 text-green-400 text-sm">
                  BYOK configuration saved successfully.
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">
                    Endpoint URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://api.your-provider.com/v1"
                    value={byokEndpoint}
                    onChange={(e) => setByokEndpoint(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">
                    API Key
                  </label>
                  <input
                    type="password"
                    placeholder="sk-…"
                    value={byokApiKey}
                    onChange={(e) => setByokApiKey(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">
                    Model Name (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="gpt-4o, claude-3-5-sonnet-20241022, …"
                    value={byokModel}
                    onChange={(e) => setByokModel(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleByokSave}
                  disabled={byokSaving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {byokSaving ? "Saving…" : "Save Configuration"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Wallet */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Wallet</h2>
          <div className="bg-[#0E1524] border border-[#1e2d4a] rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Balance</p>
                {walletLoading ? (
                  <p className="text-3xl font-bold text-gray-500">—</p>
                ) : wallet ? (
                  <p className="text-3xl font-bold text-white">
                    ${(wallet.balanceCents / 100).toFixed(2)}
                    <span className="text-sm text-gray-400 font-normal ml-1">
                      {wallet.currency?.toUpperCase() ?? "USD"}
                    </span>
                  </p>
                ) : (
                  <p className="text-gray-500 text-sm">Wallet unavailable</p>
                )}
              </div>
              <button
                onClick={() => navigate("/executions")}
                className="text-sm text-blue-400 hover:text-blue-300 transition"
              >
                View transaction history →
              </button>
            </div>

            {/* Deposit */}
            <div className="border-t border-gray-700/50 pt-5">
              <p className="text-sm font-medium text-gray-300 mb-3">Add Funds</p>
              {depositError && (
                <div className="mb-3 bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-400 text-sm">
                  {depositError}
                </div>
              )}
              {depositSuccess && (
                <div className="mb-3 bg-green-900/30 border border-green-700 rounded-lg px-3 py-2 text-green-400 text-sm">
                  Funds added successfully.
                </div>
              )}
              <div className="flex gap-3 flex-wrap">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="10.00"
                    value={depositAmount}
                    onChange={(e) => {
                      setDepositAmount(e.target.value);
                      setDepositError(null);
                      setDepositSuccess(false);
                    }}
                    className="pl-7 pr-3 py-2 w-36 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={handleDeposit}
                  disabled={depositLoading || !depositAmount}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {depositLoading ? "Processing…" : "Add Funds"}
                </button>
                {[10, 25, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setDepositAmount(String(amt))}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition"
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Funds are used for paid plan subscriptions and GPU marketplace purchases.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
