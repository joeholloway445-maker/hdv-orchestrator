import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// List API keys (show metadata only, not the actual key)
router.get("/", async (req: AuthRequest, res) => {
  const keys = await (prisma as any).apiKey.findMany({
    where: { userId: req.userId!, revoked: false },
    select: { id: true, name: true, lastUsed: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(keys);
});

// Create a new API key — returns the raw key ONCE, then only the hash is stored
router.post("/", async (req: AuthRequest, res) => {
  const { name, expiresInDays } = req.body as { name?: string; expiresInDays?: number };
  if (!name?.trim()) return res.status(400).json({ error: "name required" });

  const rawKey = `hdvk_${randomBytes(32).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const key = await (prisma as any).apiKey.create({
    data: {
      userId: req.userId!,
      name: name.trim(),
      keyHash,
      expiresAt: expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86400000) : null,
    },
  });

  res.status(201).json({ id: key.id, name: key.name, key: rawKey, createdAt: key.createdAt });
});

// Revoke an API key
router.delete("/:id", async (req: AuthRequest, res) => {
  await (prisma as any).apiKey.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { revoked: true },
  });
  res.status(204).end();
});

export { router as apiKeysRouter };
