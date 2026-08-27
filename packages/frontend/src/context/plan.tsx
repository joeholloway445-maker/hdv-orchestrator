import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import api from "../api/client";
import { useAuthStore } from "../store/auth";

export type SubscriptionPlan = "FREE" | "STARTER" | "PRO" | "ENTERPRISE" | "BYOK";

interface PlanContextValue {
  plan: SubscriptionPlan | null;
  loading: boolean;
  refresh: () => void;
}

const PlanContext = createContext<PlanContextValue>({
  plan: null,
  loading: true,
  refresh: () => {},
});

export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) {
      setPlan(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<{ plan: SubscriptionPlan }>("/plan")
      .then(({ data }) => setPlan(data.plan))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, refreshKey]);

  return (
    <PlanContext.Provider
      value={{ plan, loading, refresh: () => setRefreshKey((k) => k + 1) }}
    >
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  return useContext(PlanContext);
}
