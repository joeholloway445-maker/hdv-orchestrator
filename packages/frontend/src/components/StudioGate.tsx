import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { usePlan } from "../context/plan";
import type { SubscriptionPlan } from "../context/plan";

export type Studio = "DREAM" | "VISION" | "KNOLL" | "APEX";

interface StudioGateProps {
  studio: Studio;
  children: ReactNode;
}

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  ENTERPRISE: 3,
  BYOK: 3,
};

const STUDIO_REQUIRED: Record<Studio, SubscriptionPlan> = {
  DREAM: "STARTER",
  VISION: "PRO",
  KNOLL: "ENTERPRISE",
  APEX: "ENTERPRISE",
};

export function StudioGate({ studio, children }: StudioGateProps) {
  const { plan, loading } = usePlan();
  const navigate = useNavigate();

  if (loading) return null;

  const required = STUDIO_REQUIRED[studio];
  const currentRank = plan !== null ? PLAN_RANK[plan] : -1;
  const requiredRank = PLAN_RANK[required];

  if (currentRank >= requiredRank) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="opacity-30 pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/85 rounded-xl z-10">
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-white font-semibold text-lg mb-1">{studio} Studio</p>
        <p className="text-gray-400 text-sm mb-4">
          Requires{" "}
          <span className="text-blue-400 font-semibold">{required}</span> plan
          or higher
        </p>
        <button
          onClick={() => navigate("/plan")}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
        >
          Upgrade Plan
        </button>
      </div>
    </div>
  );
}
