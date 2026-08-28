import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const router = Router();
const prisma = new PrismaClient();

const patchSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  timezone: z.string().max(64).optional(),
  emailNotifications: z.boolean().optional(),
  byokBaseUrl: z.string().url().optional().or(z.literal("")),
  byokApiKey: z.string().optional(),
  byokModel: z.string().optional(),
});

router.get("/", async (req, res) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      timezone: true,
      emailNotifications: true,
      plan: true,
      byokBaseUrl: true,
      byokModel: true,
      createdAt: true,
    },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

router.patch("/", async (req, res) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { byokBaseUrl, byokApiKey, byokModel, ...profileFields } = parsed.data;
  const data: Record<string, unknown> = { ...profileFields };
  if (byokBaseUrl !== undefined) data.byokBaseUrl = byokBaseUrl || null;
  if (byokApiKey !== undefined) data.byokApiKey = byokApiKey || null;
  if (byokModel !== undefined) data.byokModel = byokModel || null;
  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      displayName: true,
      timezone: true,
      emailNotifications: true,
      plan: true,
      byokBaseUrl: true,
      byokModel: true,
      updatedAt: true,
    },
  });
  res.json(updated);
});

export { router as profileRouter };
