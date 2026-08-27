/**
 * Tenancy layer — per-tenant entitlements and provider routing.
 * Mirrors HDV_Foundation/tenancy, stripped of external deps.
 */

export type Plan = "FREE" | "STARTER" | "PRO" | "ENTERPRISE" | "BYOK";
export type Hosting = "local" | "hostinger" | "cloud";

export interface PlanPolicy {
  allowedHostings: readonly Hosting[];
  maxActiveParams: number | null;
}

export const PLAN_POLICIES: Readonly<Record<Plan, PlanPolicy>> = {
  FREE: { allowedHostings: ["local"], maxActiveParams: 7 },
  STARTER: { allowedHostings: ["local", "hostinger"], maxActiveParams: 8 },
  PRO: { allowedHostings: ["local", "hostinger", "cloud"], maxActiveParams: 70 },
  ENTERPRISE: { allowedHostings: ["local", "hostinger", "cloud"], maxActiveParams: null },
  BYOK: { allowedHostings: ["local", "hostinger", "cloud"], maxActiveParams: null },
};

export interface Tenant {
  id: string;
  plan: Plan;
  byokBaseUrl?: string;
  byokApiKey?: string;
  byokModel?: string;
  preferredModelId?: string;
  maxActiveParams?: number;
}

export function planPolicy(plan: Plan): PlanPolicy {
  return PLAN_POLICIES[plan];
}

export function effectiveParamCap(tenant: Tenant): number | null {
  const planCap = planPolicy(tenant.plan).maxActiveParams;
  const tenantCap = tenant.maxActiveParams ?? null;
  if (planCap === null) return tenantCap;
  if (tenantCap === null) return planCap;
  return Math.min(planCap, tenantCap);
}

export function hasUsableByok(tenant: Tenant): boolean {
  return Boolean(tenant.plan === "BYOK" && tenant.byokBaseUrl && tenant.byokApiKey);
}

/** Build provider options for a tenant — resolves to BYOK endpoint or platform env vars. */
export function tenantProviderConfig(tenant: Tenant): { baseUrl: string; apiKey: string; model: string } {
  if (hasUsableByok(tenant)) {
    return {
      baseUrl: tenant.byokBaseUrl!,
      apiKey: tenant.byokApiKey!,
      model: tenant.byokModel || process.env.AI_MODEL || "llama3.2",
    };
  }
  return {
    baseUrl: process.env.AI_BASE_URL || "http://localhost:11434",
    apiKey: process.env.AI_API_KEY || "ollama",
    model: tenant.preferredModelId || process.env.AI_MODEL || "llama3.2",
  };
}
