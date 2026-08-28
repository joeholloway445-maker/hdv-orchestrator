import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { RequestHandler } from "express";

// ── Hoist shared mock objects ──────────────────────────────────────────────
const { mockGpuListing } = vi.hoisted(() => ({
  mockGpuListing: {
    findMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// ── Prisma mock — regular function so `new PrismaClient()` works ───────────
vi.mock("@prisma/client", () => {
  function PrismaClient() {
    return {
      user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      workflow: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
      gpuListing: mockGpuListing,
      apiToken: { findUnique: vi.fn(), update: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $disconnect: vi.fn(),
    };
  }
  return {
    PrismaClient,
    GpuListingStatus: { ACTIVE: "ACTIVE", PAUSED: "PAUSED", OFFLINE: "OFFLINE" },
  };
});

vi.mock("../queue/producer", () => ({
  enqueueWorkflow: vi.fn().mockResolvedValue(undefined),
  workflowQueue: { add: vi.fn() },
}));

import { createTestApp } from "./testApp";

// GPU write routes check req.user?.id — inject a middleware that simulates a
// logged-in user. The GPU handlers look at req.user.id (not req.userId), so
// this stub bridges the gap for happy-path write tests.
const TEST_GPU_USER_ID = "gpu-user-cuid-1";
const fakeGpuAuth: RequestHandler = (req, _res, next) => {
  (req as typeof req & { user: { id: string } }).user = { id: TEST_GPU_USER_ID };
  next();
};

const appPublic = createTestApp();
const appAuthed = createTestApp({ gpuAuthMiddleware: fakeGpuAuth });

const makeListing = (id = "gpu-1") => ({
  id,
  label: "Test GPU",
  gpuModel: "RTX 4090",
  vramGb: 24,
  ratePerHour: 2.5,
  endpointUrl: "http://localhost:8080",
  userId: TEST_GPU_USER_ID,
  status: "ACTIVE" as const,
  apiKeyHash: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("GET /gpu (public)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with an array of listings", async () => {
    const listing = makeListing();
    mockGpuListing.findMany.mockResolvedValue([
      {
        id: listing.id,
        label: listing.label,
        gpuModel: listing.gpuModel,
        vramGb: listing.vramGb,
        ratePerHour: listing.ratePerHour,
        endpointUrl: listing.endpointUrl,
      },
    ]);

    const res = await request(appPublic).get("/gpu");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("POST /gpu (auth required)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 201 with created listing", async () => {
    const created = makeListing("gpu-new");
    mockGpuListing.create.mockResolvedValue(created);

    const res = await request(appAuthed)
      .post("/gpu")
      .send({
        label: "Test GPU",
        gpuModel: "RTX 4090",
        vramGb: 24,
        ratePerHour: 2.5,
        endpointUrl: "http://localhost:8080",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "gpu-new", label: "Test GPU" });
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(appPublic)
      .post("/gpu")
      .send({
        label: "Test GPU",
        gpuModel: "RTX 4090",
        vramGb: 24,
        ratePerHour: 2.5,
        endpointUrl: "http://localhost:8080",
      });

    expect(res.status).toBe(401);
  });
});

describe("PATCH /gpu/:id/status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with updated status", async () => {
    const listing = makeListing("gpu-patch");
    mockGpuListing.findUnique.mockResolvedValue(listing);
    mockGpuListing.update.mockResolvedValue({ id: "gpu-patch", status: "PAUSED" });

    const res = await request(appAuthed)
      .patch("/gpu/gpu-patch/status")
      .send({ status: "PAUSED" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "PAUSED" });
  });
});
