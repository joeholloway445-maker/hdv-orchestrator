import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  userId?: string;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function verifyToken(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = header.slice(7);

  // Try JWT first
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    req.userId = payload.userId;
    return next();
  } catch {
    // Fall through to API token check
  }

  // Try API token (starts with "hdv_")
  if (token.startsWith("hdv_")) {
    const tokenHash = hashToken(token);
    const apiToken = await (prisma as any).apiToken.findUnique({
      where: { tokenHash },
      select: { userId: true, id: true },
    });
    if (apiToken) {
      req.userId = apiToken.userId;
      // Update lastUsedAt in background
      (prisma as any).apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      return next();
    }
  }

  return res.status(401).json({ error: "Invalid token" });
}
