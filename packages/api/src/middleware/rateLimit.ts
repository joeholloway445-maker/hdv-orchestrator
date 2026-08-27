import { type Request } from "express";
import rateLimit from 'express-rate-limit';
import type { AuthRequest } from "./auth";

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' }
});

export const executionLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Execution rate limit exceeded.' }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts.' }
});

/** Resolve the tenant identifier from the request, or return undefined. */
function resolveTenantId(req: Request): string | undefined {
  const header = req.headers['x-tenant-id'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (fromHeader) return fromHeader;
  // Fall back to req.user?.tenantId (set by auth middleware on some flows).
  return (req as AuthRequest & { user?: { tenantId?: string } }).user?.tenantId;
}

/**
 * Per-tenant rate limit: 500 req/min.  Only applied when a tenant ID is
 * present — unauthenticated requests are skipped so they fall through to the
 * global IP limiter only.
 */
export const tenantLimiter = rateLimit({
  windowMs: 60_000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !resolveTenantId(req),
  keyGenerator: (req) => resolveTenantId(req) ?? req.ip ?? 'unknown',
  message: { error: 'Tenant rate limit exceeded', retryAfter: 60 },
});
