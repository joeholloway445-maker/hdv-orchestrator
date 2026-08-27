/**
 * providers/catalog.ts — Static model/provider catalog for the HDV tenancy layer.
 *
 * Ported and expanded from HDV_Foundation's provider registry pattern. Provides a static
 * list of known LLM models with their parameter counts and compatible hosting environments,
 * enabling the tenancy layer (tenancy/index.ts) to enforce plan-based model caps and route
 * requests to the right backend.
 *
 * This catalog is intentionally conservative: it only lists models that are known-deployable
 * on each hosting tier. New models should be added here (not in the tenancy layer) to keep
 * plan policy and model knowledge separate.
 *
 * Zero external dependencies.
 */
import type { Hosting, Plan, Tenant } from '../tenancy/index.js';
import { effectiveParamCap, planPolicy } from '../tenancy/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelEntry {
  /**
   * Canonical model id as used in Ollama / OpenAI-compatible API requests.
   * Examples: "llama3.2", "llama3.1:70b", "qwen2.5:72b".
   */
  id: string;
  /** Human-readable display name. */
  displayName: string;
  /**
   * Approximate parameter count in billions. Used to enforce plan caps
   * (e.g. FREE plan allows up to 7B, PRO allows up to 70B).
   */
  paramsBillions: number;
  /**
   * Hosting environments this model is realistically runnable on given its VRAM requirements.
   * Models that fit in ≤8 GB VRAM are "local"; larger models need "hostinger" or "cloud".
   */
  compatibleHostings: readonly Hosting[];
  /** Approximate VRAM requirement in GB (informational; used to determine hosting tier). */
  vramGb?: number;
  /** True if this is the recommended default for its tier. */
  isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Static catalog
// ---------------------------------------------------------------------------

/**
 * Known models in approximate parameter-count order. Each entry declares which hosting
 * tiers it can run on. "local" = developer laptop / small VPS (≤12 GB VRAM); "hostinger" =
 * affordable GPU VPS (24–48 GB VRAM); "cloud" = managed GPU cloud (any size).
 */
export const MODEL_CATALOG: readonly ModelEntry[] = [
  // ---- Sub-4B (always local) ----------------------------------------------
  {
    id: 'llama3.2:1b',
    displayName: 'Llama 3.2 1B',
    paramsBillions: 1,
    compatibleHostings: ['local'],
    vramGb: 1,
  },
  {
    id: 'gemma2:2b',
    displayName: 'Gemma 2 2B',
    paramsBillions: 2,
    compatibleHostings: ['local'],
    vramGb: 2,
  },
  {
    id: 'phi3.5',
    displayName: 'Phi-3.5 Mini 3.8B',
    paramsBillions: 3.8,
    compatibleHostings: ['local'],
    vramGb: 3,
  },
  // ---- 4–8B (local-tier default models) -----------------------------------
  {
    id: 'llama3.2',
    displayName: 'Llama 3.2 3B',
    paramsBillions: 3,
    compatibleHostings: ['local'],
    vramGb: 3,
    isDefault: true,          // Default for FREE plan
  },
  {
    id: 'llama3.1:8b',
    displayName: 'Llama 3.1 8B',
    paramsBillions: 8,
    compatibleHostings: ['local'],
    vramGb: 6,
  },
  {
    id: 'qwen2.5:7b',
    displayName: 'Qwen 2.5 7B',
    paramsBillions: 7,
    compatibleHostings: ['local'],
    vramGb: 5,
  },
  {
    id: 'mistral',
    displayName: 'Mistral 7B v0.3',
    paramsBillions: 7,
    compatibleHostings: ['local'],
    vramGb: 5,
  },
  {
    id: 'gemma2:9b',
    displayName: 'Gemma 2 9B',
    paramsBillions: 9,
    compatibleHostings: ['local', 'hostinger'],
    vramGb: 7,
  },
  // ---- 13B (hostinger / cloud) --------------------------------------------
  {
    id: 'llama3.1:13b',
    displayName: 'Llama 3.1 13B',
    paramsBillions: 13,
    compatibleHostings: ['hostinger', 'cloud'],
    vramGb: 10,
  },
  {
    id: 'qwen2.5:14b',
    displayName: 'Qwen 2.5 14B',
    paramsBillions: 14,
    compatibleHostings: ['hostinger', 'cloud'],
    vramGb: 11,
  },
  // ---- 30–47B (hostinger / cloud) -----------------------------------------
  {
    id: 'mixtral:8x7b',
    displayName: 'Mixtral 8×7B MoE',
    paramsBillions: 47,
    compatibleHostings: ['hostinger', 'cloud'],
    vramGb: 28,
  },
  {
    id: 'qwen2.5:32b',
    displayName: 'Qwen 2.5 32B',
    paramsBillions: 32,
    compatibleHostings: ['hostinger', 'cloud'],
    vramGb: 20,
  },
  // ---- 70B (cloud or high-end hostinger) ----------------------------------
  {
    id: 'llama3.1:70b',
    displayName: 'Llama 3.1 70B',
    paramsBillions: 70,
    compatibleHostings: ['hostinger', 'cloud'],
    vramGb: 42,
    isDefault: true,          // Default for PRO plan
  },
  {
    id: 'qwen2.5:72b',
    displayName: 'Qwen 2.5 72B',
    paramsBillions: 72,
    compatibleHostings: ['hostinger', 'cloud'],
    vramGb: 44,
  },
] as const;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Look up a model by its exact id. Returns undefined when unknown. */
export function findModel(id: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

/**
 * All models allowed under a given plan, based on the plan's maxActiveParams cap
 * and its allowed hosting environments. The returned list is sorted by parameter count
 * (smallest first) so callers can cheaply pick the largest or smallest suitable model.
 */
export function modelsForPlan(plan: Plan): ModelEntry[] {
  const policy = planPolicy(plan);
  const paramCap = policy.maxActiveParams;

  return MODEL_CATALOG.filter((m) => {
    if (paramCap !== null && m.paramsBillions > paramCap) return false;
    return m.compatibleHostings.some((h) => policy.allowedHostings.includes(h));
  }).slice(); // return a mutable copy
}

/**
 * Whether a specific model is allowed for a tenant, taking both plan caps and tenant
 * overrides into account.
 *
 * Returns false when:
 *  - The model is not in the catalog (unknown models are not allowed by default)
 *  - The tenant's effective param cap (plan × tenant override) is lower than the model size
 *  - The model's hosting requirements exceed what the tenant's plan allows
 */
export function isModelAllowed(tenant: Tenant, modelId: string): boolean {
  const entry = findModel(modelId);
  if (!entry) return false;

  const cap = effectiveParamCap(tenant);
  if (cap !== null && entry.paramsBillions > cap) return false;

  const policy = planPolicy(tenant.plan);
  return entry.compatibleHostings.some((h) => policy.allowedHostings.includes(h));
}

/**
 * The recommended default model id for a tenant, based on their plan and (optional) preferred
 * model. Falls back to the plan's default catalog entry, then the smallest model in the
 * catalog that fits the plan.
 */
export function defaultModelForTenant(tenant: Tenant): string {
  // Prefer the tenant's explicitly set preferred model if it's allowed.
  if (tenant.preferredModelId && isModelAllowed(tenant, tenant.preferredModelId)) {
    return tenant.preferredModelId;
  }

  const allowed = modelsForPlan(tenant.plan);

  // Prefer a catalog entry flagged as the plan's default.
  const planDefault = allowed.find((m) => m.isDefault);
  if (planDefault) return planDefault.id;

  // Fall back to the largest allowed model (most capable within the cap).
  const largest = [...allowed].sort((a, b) => b.paramsBillions - a.paramsBillions)[0];
  if (largest) return largest.id;

  // Ultimate fallback — always present in the catalog.
  return 'llama3.2';
}
