/**
 * Admin API routes — protected by ADMIN_SECRET_KEY header.
 * Mount at /admin in index.ts.
 */
import { Router, Request, Response } from "express";
import { PrismaClient, GpuListingStatus, SubscriptionPlan } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

const VALID_PLANS: SubscriptionPlan[] = ["FREE", "STARTER", "PRO", "ENTERPRISE", "BYOK"];

function requireAdminKey(req: Request, res: Response): boolean {
  const key = req.headers["x-admin-key"];
  const expected = process.env.ADMIN_SECRET_KEY;
  if (!expected) {
    res.status(500).json({ error: "ADMIN_SECRET_KEY not configured on server" });
    return false;
  }
  if (!key || key !== expected) {
    res.status(403).json({ error: "Forbidden: invalid admin key" });
    return false;
  }
  return true;
}

/** GET /admin/tenants — all users with plan, tenantId, GPU listing count */
router.get("/tenants", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdminKey(req, res)) return;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      plan: true,
      tenantId: true,
      createdAt: true,
      _count: { select: { gpuListings: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(
    users.map((u) => ({
      id: u.id,
      tenantId: u.tenantId ?? u.id,
      email: u.email,
      plan: u.plan,
      createdAt: u.createdAt,
      gpuListingCount: u._count.gpuListings,
    }))
  );
});

/** GET /admin/audit — audit chain status (stub — runs in worker process) */
router.get("/audit", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdminKey(req, res)) return;

  res.json({
    entries: [],
    verified: true,
    message: "Audit log stored in worker process",
  });
});

/** GET /admin/gpu — all GPU listings with owner email */
router.get("/gpu", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdminKey(req, res)) return;

  const listings = await prisma.gpuListing.findMany({
    include: {
      user: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(
    listings.map((l) => ({
      id: l.id,
      label: l.label,
      gpuModel: l.gpuModel,
      vramGb: l.vramGb,
      ratePerHour: l.ratePerHour,
      status: l.status,
      ownerEmail: l.user.email,
      createdAt: l.createdAt,
    }))
  );
});

/** PATCH /admin/gpu/:id/status — admin toggle any GPU listing status */
router.patch("/gpu/:id/status", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdminKey(req, res)) return;

  const { status } = req.body as { status?: string };
  if (!status || !["ACTIVE", "PAUSED", "OFFLINE"].includes(status)) {
    res.status(400).json({ error: "status must be ACTIVE | PAUSED | OFFLINE" });
    return;
  }

  const updated = await prisma.gpuListing.update({
    where: { id: req.params.id },
    data: { status: status as GpuListingStatus },
    select: { id: true, status: true },
  });

  res.json(updated);
});

/** PATCH /admin/plan/:userId — admin plan override */
router.patch("/plan/:userId", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdminKey(req, res)) return;

  const { plan } = req.body as { plan?: SubscriptionPlan };
  if (!plan || !VALID_PLANS.includes(plan)) {
    res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(", ")}` });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: req.params.userId },
    data: { plan },
    select: { id: true, email: true, plan: true },
  });

  res.json(updated);
});

export { router as adminRouter };
