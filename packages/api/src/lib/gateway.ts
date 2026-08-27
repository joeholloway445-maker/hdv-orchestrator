/**
 * lib/gateway.ts — Pure gateway utilities ported from HDV_Foundation/gateway/middleware.ts.
 *
 * Extracted pieces with no external dependencies (node:crypto only):
 *   - RateLimiter: fixed-window in-memory rate limiter keyed by arbitrary string (IP, tenant).
 *   - extractKey / keysMatch: timing-safe API key extraction and comparison.
 *   - clientIp: X-Forwarded-For extraction with socket fallback.
 *   - tenantFromHeaders / rawTenantId: X-HDV-Tenant header helpers.
 *   - LogEntry / defaultLogger: structured JSON request logging (no secrets).
 *   - GatewaySecurityConfig / resolveSecurityConfig: env-driven security config resolution.
 *
 * What is NOT ported: GatewayMiddleware (Express handles that), and app-specific path sets
 * (ALWAYS_PUBLIC_PATHS, etc.) which belong in the route layer.
 *
 * Zero external dependencies — safe to import anywhere in the API package.
 */
import { timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

/** Default requests-per-window when HDV_RATE_LIMIT is unset/invalid. */
export const DEFAULT_RATE_LIMIT = 60;
/** Default per-tenant requests-per-window when HDV_TENANT_RATE_LIMIT is unset/invalid. */
export const DEFAULT_TENANT_RATE_LIMIT = 20;
/** Rate-limit window length in milliseconds. */
export const RATE_LIMIT_WINDOW_MS = 60_000;
/** Default CORS origin when HDV_CORS_ORIGIN is unset. */
export const DEFAULT_CORS_ORIGIN = '*';
/** Default auth-endpoint requests-per-window when HDV_AUTH_RATE_LIMIT is unset/invalid. */
export const DEFAULT_AUTH_RATE_LIMIT = 10;

interface RateBucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window, in-memory rate limiter keyed by an arbitrary string (IP address, tenant id,
 * or any composite key). Not distributed — one process, one map. Buckets are lazily reset
 * when their window elapses; stale buckets are swept opportunistically at 10 000 keys.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /**
   * Record a hit for `key`. Returns whether it is allowed plus bucket metadata.
   * A non-positive limit disables rate limiting (all requests are allowed).
   */
  hit(
    key: string,
    now: number = Date.now(),
  ): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
    if (this.limit <= 0) {
      return { allowed: true, remaining: Infinity, resetAt: now + this.windowMs, limit: this.limit };
    }

    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (this.buckets.size > 10_000) this.sweep(now);

    const allowed = bucket.count <= this.limit;
    const remaining = Math.max(0, this.limit - bucket.count);
    return { allowed, remaining, resetAt: bucket.resetAt, limit: this.limit };
  }

  /** Drop buckets whose window has fully elapsed to bound memory. */
  private sweep(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  reset(): void {
    this.buckets.clear();
  }
}

// ---------------------------------------------------------------------------
// Security config
// ---------------------------------------------------------------------------

export interface GatewaySecurityConfig {
  /** API key required on protected routes. Empty/undefined → dev mode (auth disabled). */
  apiKey?: string;
  /** Max requests per window per client IP. */
  rateLimit: number;
  /** Max requests per window per tenant (X-HDV-Tenant), for multi-tenant surfaces. */
  tenantRateLimit: number;
  /** Window length in ms for both rate limiters. */
  windowMs: number;
  /** Value for the Access-Control-Allow-Origin header. */
  corsOrigin: string;
  /** Max requests per window per client IP, specifically for auth endpoints. */
  authRateLimit: number;
}

export interface SecurityOverrides {
  apiKey?: string;
  rateLimit?: number;
  tenantRateLimit?: number;
  windowMs?: number;
  corsOrigin?: string;
  authRateLimit?: number;
}

/**
 * Resolve the effective security config from env with explicit overrides taking precedence.
 * Env is read lazily (not at import time) so tests can drive it deterministically.
 */
export function resolveSecurityConfig(
  overrides: SecurityOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): GatewaySecurityConfig {
  const rawKey = overrides.apiKey ?? env.HDV_API_KEY;
  const apiKey = rawKey && rawKey.trim().length > 0 ? rawKey.trim() : undefined;

  const rateLimit = overrides.rateLimit ?? parsePositiveInt(env.HDV_RATE_LIMIT) ?? DEFAULT_RATE_LIMIT;
  const tenantRateLimit =
    overrides.tenantRateLimit ??
    parsePositiveInt(env.HDV_TENANT_RATE_LIMIT) ??
    DEFAULT_TENANT_RATE_LIMIT;
  const windowMs = overrides.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const corsOrigin =
    overrides.corsOrigin ??
    (env.HDV_CORS_ORIGIN && env.HDV_CORS_ORIGIN.trim().length > 0
      ? env.HDV_CORS_ORIGIN.trim()
      : DEFAULT_CORS_ORIGIN);
  const authRateLimit =
    overrides.authRateLimit ?? parsePositiveInt(env.HDV_AUTH_RATE_LIMIT) ?? DEFAULT_AUTH_RATE_LIMIT;

  return { apiKey, rateLimit, tenantRateLimit, windowMs, corsOrigin, authRateLimit };
}

// ---------------------------------------------------------------------------
// Key extraction and timing-safe comparison
// ---------------------------------------------------------------------------

/** Extract a presented API key from X-HDV-Key or a Bearer Authorization header. */
export function extractKey(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const direct = firstHeader(headers['x-hdv-key']);
  if (direct && direct.trim().length > 0) return direct.trim();

  const auth = firstHeader(headers['authorization']);
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match && match[1].trim().length > 0) return match[1].trim();
  }
  return undefined;
}

/**
 * Constant-time comparison to avoid leaking key length via early-exit timing.
 * Returns false immediately when lengths differ (length is not secret for equal-length keys).
 */
export function keysMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// IP and tenant extraction
// ---------------------------------------------------------------------------

/** Best-effort client IP from an x-forwarded-for chain, falling back to the socket address. */
export function clientIp(
  headers: Record<string, string | string[] | undefined>,
  socketAddress: string | undefined,
): string {
  const fwd = firstHeader(headers['x-forwarded-for']);
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return socketAddress ?? 'unknown';
}

/**
 * Raw X-HDV-Tenant header value (trimmed), or undefined when absent/blank. Does NOT default
 * to "demo" — use this for logging so a log entry only carries a `tenant` field when the
 * caller actually sent one.
 */
export function rawTenantId(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const trimmed = firstHeader(headers['x-hdv-tenant'])?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve the tenant id from the X-HDV-Tenant header (default "demo"). Shared across
 * billing, per-tenant rate limiting, and any other surface that needs a tenant identity.
 */
export function tenantFromHeaders(
  headers?: Record<string, string | string[] | undefined>,
): string {
  if (!headers) return 'demo';
  return rawTenantId(headers) ?? 'demo';
}

// ---------------------------------------------------------------------------
// Structured request logging
// ---------------------------------------------------------------------------

export interface LogEntry {
  /** ISO-8601 timestamp, e.g. "2026-08-10T14:03:21.045Z". */
  timestamp: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip: string;
  authState: 'disabled' | 'authorized' | 'rejected' | 'public';
  /** X-HDV-Tenant, present only when the caller sent one. */
  tenant?: string;
}

export type GatewayLogger = (entry: LogEntry) => void;

/**
 * Default logger: single-line JSON to stdout, one entry per request. Dependency-free and
 * trivially greppable (`grep '"status":429'`, `grep '"tenant":"<id>"'`). Secrets are never
 * included in LogEntry.
 */
export const defaultLogger: GatewayLogger = (entry) => {
  console.log(JSON.stringify({ gateway: 'hdv', ...entry }));
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const floored = Math.floor(n);
  return floored >= 0 ? floored : undefined;
}
