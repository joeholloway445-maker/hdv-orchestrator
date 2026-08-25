import { Router } from "express";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// GET /tokens — list user's API tokens
router.get("/", async (req: AuthRequest, res) => {
  const tokens = await (prisma as any).apiToken.findMany({
    where: { userId: req.userId! },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(tokens);
});

// POST /tokens — create a new API token
router.post("/", async (req: AuthRequest, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Token name required" });

  const rawToken = `hdv_${crypto.randomBytes(32).toString("hex")}`;
  const tokenHash = hashToken(rawToken);
  const prefix = rawToken.slice(0, 12);

  const token = await (prisma as any).apiToken.create({
    data: { userId: req.userId!, name: name.trim(), tokenHash, prefix },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });

  res.status(201).json({ ...token, token: rawToken });
});

// DELETE /tokens/:id — revoke a token
router.delete("/:id", async (req: AuthRequest, res) => {
  const existing = await (prisma as any).apiToken.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!existing) return res.status(404).json({ error: "Token not found" });
  await (prisma as any).apiToken.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export { router as tokensRouter };
