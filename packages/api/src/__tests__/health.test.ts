import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// Mock @prisma/client — use a regular function so `new PrismaClient()` works
vi.mock("@prisma/client", () => {
  function PrismaClient() {
    return {
      user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      workflow: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
      gpuListing: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
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

const app = createTestApp();

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });
});
