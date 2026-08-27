/**
 * HOPE Companion routes
 * POST /hope/companion — look up or create the per-tenant HOPE Companion workflow.
 * GET  /hope/companion — fetch the companion workflow + current state.
 *
 * The companion workflow has a single HOPE trigger node and is tagged:
 *   ["hope-companion", "tenant:{tenantId}"]
 */
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

const COMPANION_TAG = "hope-companion";

/** Derive the tenant tag string from a tenantId. */
function tenantTag(tenantId: string): string {
  return `tenant:${tenantId}`;
}

/** Canonical HOPE trigger node definition. */
function hopeNodeDefinition() {
  return {
    id: "hope-trigger",
    type: "hope",
    position: { x: 250, y: 150 },
    data: {
      label: "HOPE",
      nodeType: "hope",
      description: "HOPE Companion trigger — receives messages from the Periliminal Space",
    },
  };
}

async function findCompanion(userId: string, tenantId: string) {
  const companions = await (prisma as any).workflow.findMany({
    where: {
      userId,
      tags: { hasEvery: [COMPANION_TAG, tenantTag(tenantId)] },
    },
    orderBy: { createdAt: "asc" },
    take: 1,
    include: {
      executions: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { id: true, status: true, startedAt: true, finishedAt: true },
      },
    },
  });
  return companions[0] ?? null;
}

/**
 * POST /hope/companion
 * Idempotently bootstraps the HOPE Companion workflow for the calling user's tenant.
 */
router.post("/companion", async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, tenantId: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.tenantId) {
    return res.status(400).json({
      error: "No tenantId on this account — call POST /tenants/provision first",
    });
  }

  // Check for an existing companion
  const existing = await findCompanion(user.id, user.tenantId);
  if (existing) {
    return res.json({
      companion: existing,
      created: false,
      tenantId: user.tenantId,
    });
  }

  // Create the companion workflow
  const companion = await (prisma as any).workflow.create({
    data: {
      name: "HOPE Companion",
      userId: user.id,
      nodes: [hopeNodeDefinition()],
      edges: [],
      active: true,
      description: "Auto-provisioned HOPE Companion workflow for Periliminal Space integration.",
      tags: [COMPANION_TAG, tenantTag(user.tenantId)],
    },
  });

  return res.status(201).json({
    companion,
    created: true,
    tenantId: user.tenantId,
  });
});

/**
 * GET /hope/companion
 * Fetch the HOPE Companion workflow + most recent execution state.
 */
router.get("/companion", async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, tenantId: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.tenantId) {
    return res.status(400).json({
      error: "No tenantId on this account — call POST /tenants/provision first",
    });
  }

  const companion = await findCompanion(user.id, user.tenantId);
  if (!companion) {
    return res.status(404).json({
      error: "No HOPE Companion found — call POST /hope/companion to bootstrap it",
    });
  }

  return res.json({
    companion,
    tenantId: user.tenantId,
  });
});

export { router as hopeRouter };
