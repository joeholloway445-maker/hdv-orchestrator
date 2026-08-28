import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth";

const prisma = new PrismaClient();

/**
 * API key authentication middleware.
 * Checks for an `x-api-key` header; if present, validates it against the DB.
 * Falls through to the next middleware (JWT auth) if the header is absent.
 */
export async function apiKeyAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers["x-api-key"] as string | undefined;
  if (!header) return next(); // fall through to JWT auth

  const keyHash = createHash("sha256").update(header).digest("hex");
  const apiKey = await (prisma as any).apiKey.findUnique({
    where: { keyHash },
  });

  if (!apiKey || apiKey.revoked) {
    return res.status(401).json({ error: "invalid api key" });
  }
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return res.status(401).json({ error: "api key expired" });
  }

  // Update lastUsed async — don't block the request
  (prisma as any).apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsed: new Date() } })
    .catch(() => {});

  req.userId = apiKey.userId;
  next();
}
