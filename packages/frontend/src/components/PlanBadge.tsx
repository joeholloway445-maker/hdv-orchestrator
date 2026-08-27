import { usePlan } from "../context/plan";
import type { SubscriptionPlan } from "../context/plan";

const BADGE_STYLES: Record<SubscriptionPlan, string> = {
  FREE: "bg-gray-700 text-gray-300",
  STARTER: "bg-blue-900/60 text-blue-300",
  PRO: "bg-purple-900/60 text-purple-300",
  ENTERPRISE: "bg-amber-900/60 text-amber-300",
  BYOK: "bg-emerald-900/60 text-emerald-300",
};

export function PlanBadge() {
  const { plan, loading } = usePlan();

  if (loading || !plan) return null;

  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE_STYLES[plan]}`}
      title={`Current plan: ${plan}`}
    >
      {plan}
    </span>
  );
}
