/**
 * HOPE/Supabase auth middleware — validates Supabase JWT tokens issued by HOPE.
 *
 * When SUPABASE_JWT_SECRET is configured, this middleware accepts tokens from the
 * Supabase GoTrue JWT issuer in addition to the internal HDV JWT tokens.
 *
 * Priority order:
 *   1. Supabase JWT (when SUPABASE_JWT_SECRET is set)
 *   2. Internal HDV JWT (JWT_SECRET)
 *   3. HDV API token (hdv_... prefix, stored hash in DB)
 *
 * Falls through to the existing verifyToken middleware if this one doesn't match.
 */
import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { AuthRequest } from "./auth";

interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  role?: string;
  aud?: string;
}

export function supabaseAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return next(); // not configured — fall through

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as SupabaseJwtPayload;
    // Supabase puts the user UUID in `sub`
    if (payload.sub) {
      req.userId = payload.sub;
      return next();
    }
  } catch {
    // Not a valid Supabase JWT — fall through to next auth handler
  }

  return next();
}

/** Combined auth: tries Supabase first, then falls through to existing verifyToken. */
export function hopeAuth(req: Request, res: Response, next: NextFunction) {
  supabaseAuth(req as AuthRequest, res, () => {
    // If supabaseAuth already set userId, go straight to route
    if ((req as AuthRequest).userId) return next();
    // Otherwise hand off to the standard verifyToken handler (imported separately)
    next();
  });
}
