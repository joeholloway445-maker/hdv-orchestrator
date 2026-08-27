import { Router, Request, Response } from "express";
import { PrismaClient, SubscriptionPlan } from "@prisma/client";

const prisma = new PrismaClient();
export const planRouter = Router();

const VALID_PLANS: SubscriptionPlan[] = ["FREE", "STARTER", "PRO", "ENTERPRISE", "BYOK"];

/** GET /plan — current user's plan info */
planRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, tenantId: true, byokBaseUrl: true, byokModel: true },
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json({
    plan: user.plan,
    tenantId: user.tenantId,
    byok: user.plan === "BYOK" ? { baseUrl: user.byokBaseUrl, model: user.byokModel } : null,
    studios: {
      HOPE: true,
      DREAM: ["STARTER", "PRO", "ENTERPRISE", "BYOK"].includes(user.plan),
      VISION: ["PRO", "ENTERPRISE", "BYOK"].includes(user.plan),
      KNOLL: ["ENTERPRISE", "BYOK"].includes(user.plan),
      APEX: ["ENTERPRISE", "BYOK"].includes(user.plan),
    },
  });
});

/** PATCH /plan — upgrade/downgrade plan (admin or self-serve in dev) */
planRouter.patch("/", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { plan, byokBaseUrl, byokModel } = req.body as {
    plan?: SubscriptionPlan;
    byokBaseUrl?: string;
    byokModel?: string;
  };

  if (!plan || !VALID_PLANS.includes(plan)) {
    res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(", ")}` });
    return;
  }
  if (plan === "BYOK" && !byokBaseUrl) {
    res.status(400).json({ error: "BYOK plan requires byokBaseUrl" });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      byokBaseUrl: plan === "BYOK" ? byokBaseUrl : null,
      byokModel: plan === "BYOK" ? (byokModel ?? null) : null,
    },
    select: { plan: true, byokBaseUrl: true, byokModel: true },
  });

  res.json({ ok: true, ...updated });
});
