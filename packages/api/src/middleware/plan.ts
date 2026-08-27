import { Request, Response, NextFunction } from "express";
import { SubscriptionPlan } from "@prisma/client";

export type StudioId = "HOPE" | "DREAM" | "VISION" | "KNOLL" | "APEX";

const PLAN_ORDER: SubscriptionPlan[] = [
  "FREE",
  "STARTER",
  "PRO",
  "ENTERPRISE",
  "BYOK",
];

const STUDIO_REQUIRED: Record<StudioId, SubscriptionPlan> = {
  HOPE: "FREE",
  DREAM: "STARTER",
  VISION: "PRO",
  KNOLL: "ENTERPRISE",
  APEX: "ENTERPRISE",
};

function planRank(plan: SubscriptionPlan): number {
  const idx = PLAN_ORDER.indexOf(plan);
  // BYOK is treated as ENTERPRISE-level
  if (plan === "BYOK") return PLAN_ORDER.indexOf("ENTERPRISE");
  return idx === -1 ? 0 : idx;
}

/** Express middleware that gates a route behind a minimum HDV studio subscription. */
export function requireStudio(studio: StudioId) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: { plan?: SubscriptionPlan } }).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const userPlan: SubscriptionPlan = user.plan ?? "FREE";
    const required = STUDIO_REQUIRED[studio];
    if (planRank(userPlan) < planRank(required)) {
      res.status(403).json({
        error: `${studio} studio requires ${required} plan or higher`,
        currentPlan: userPlan,
        upgradeRequired: required,
      });
      return;
    }
    next();
  };
}
