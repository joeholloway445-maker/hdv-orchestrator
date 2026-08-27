/**
 * GPU marketplace routes — users list their hardware for burst GPU workloads
 * (image/video generation tasks that need more than CPU inference).
 */
import { Router, Request, Response } from "express";
import { PrismaClient, GpuListingStatus } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();
export const gpuRouter = Router();

type AuthReq = Request & { user?: { id: string } };

/** GET /gpu — list all ACTIVE GPU listings (for router to pick from) */
gpuRouter.get("/", async (_req: Request, res: Response): Promise<void> => {
  const listings = await prisma.gpuListing.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true, label: true, gpuModel: true, vramGb: true,
      ratePerHour: true, endpointUrl: true,
    },
    orderBy: { ratePerHour: "asc" },
  });
  res.json(listings);
});

/** GET /gpu/mine — current user's listings */
gpuRouter.get("/mine", async (req: AuthReq, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const listings = await prisma.gpuListing.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(listings);
});

/** POST /gpu — register a GPU listing */
gpuRouter.post("/", async (req: AuthReq, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { label, gpuModel, vramGb, ratePerHour, endpointUrl, apiKey } = req.body as {
    label: string;
    gpuModel: string;
    vramGb: number;
    ratePerHour: number;
    endpointUrl: string;
    apiKey?: string;
  };

  if (!label || !gpuModel || !vramGb || !ratePerHour || !endpointUrl) {
    res.status(400).json({ error: "label, gpuModel, vramGb, ratePerHour, endpointUrl required" });
    return;
  }

  const apiKeyHash = apiKey
    ? createHash("sha256").update(apiKey).digest("hex")
    : null;

  const listing = await prisma.gpuListing.create({
    data: { userId, label, gpuModel, vramGb, ratePerHour, endpointUrl, apiKeyHash },
  });

  res.status(201).json({ id: listing.id, label: listing.label, status: listing.status });
});

/** PATCH /gpu/:id/status — toggle ACTIVE/PAUSED/OFFLINE */
gpuRouter.patch("/:id/status", async (req: AuthReq, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { status } = req.body as { status?: GpuListingStatus };
  if (!status || !["ACTIVE", "PAUSED", "OFFLINE"].includes(status)) {
    res.status(400).json({ error: "status must be ACTIVE | PAUSED | OFFLINE" });
    return;
  }

  const listing = await prisma.gpuListing.findUnique({ where: { id: req.params.id } });
  if (!listing || listing.userId !== userId) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const updated = await prisma.gpuListing.update({
    where: { id: req.params.id },
    data: { status },
    select: { id: true, status: true },
  });

  res.json(updated);
});

/** DELETE /gpu/:id — remove a listing */
gpuRouter.delete("/:id", async (req: AuthReq, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const listing = await prisma.gpuListing.findUnique({ where: { id: req.params.id } });
  if (!listing || listing.userId !== userId) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  await prisma.gpuListing.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
