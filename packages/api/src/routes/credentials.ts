import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";
import { encrypt, decrypt } from "../lib/crypto";

const router = Router();
const prisma = new PrismaClient();

router.get("/", async (req: AuthRequest, res) => {
  const creds = await prisma.credential.findMany({
    where: { userId: req.userId! },
    orderBy: { name: "asc" },
  });
  res.json(creds.map(({ data: _d, ...c }) => c));
});

router.post("/", async (req: AuthRequest, res) => {
  const { name, type, data } = req.body as { name: string; type: string; data: Record<string, unknown> };
  if (!name || !type) return res.status(400).json({ error: "name and type are required" });
  const cred = await prisma.credential.create({
    data: { userId: req.userId!, name, type, data: encrypt(JSON.stringify(data ?? {})) },
  });
  const { data: _d, ...safe } = cred;
  res.status(201).json(safe);
});

router.put("/:id", async (req: AuthRequest, res) => {
  const cred = await prisma.credential.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!cred) return res.status(404).json({ error: "Not found" });
  const { name, type, data } = req.body as { name?: string; type?: string; data?: Record<string, unknown> };
  const updated = await prisma.credential.update({
    where: { id: cred.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(data !== undefined ? { data: encrypt(JSON.stringify(data)) } : {}),
    },
  });
  const { data: _d, ...safe } = updated;
  res.json(safe);
});

router.get("/:id/reveal", async (req: AuthRequest, res) => {
  const cred = await prisma.credential.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!cred) return res.status(404).json({ error: "Not found" });
  try {
    res.json({ data: JSON.parse(decrypt(cred.data)) });
  } catch {
    res.status(500).json({ error: "Decryption failed" });
  }
});

router.delete("/:id", async (req: AuthRequest, res) => {
  const cred = await prisma.credential.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!cred) return res.status(404).json({ error: "Not found" });
  await prisma.credential.delete({ where: { id: cred.id } });
  res.json({ ok: true });
});

export { router as credentialsRouter };
