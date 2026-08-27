import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// ── Hoist shared mock objects ──────────────────────────────────────────────
const { mockUser, mockWorkflow } = vi.hoisted(() => ({
  mockUser: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  mockWorkflow: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// ── Prisma mock — regular function so `new PrismaClient()` works ───────────
vi.mock("@prisma/client", () => {
  function PrismaClient() {
    return {
      user: mockUser,
      workflow: mockWorkflow,
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

const TEST_USER_ID = "user-cuid-workflows";
let authToken: string;

beforeAll(() => {
  authToken = jwt.sign({ userId: TEST_USER_ID }, process.env.JWT_SECRET!, { expiresIn: "1h" });
});

const authHeader = () => ({ Authorization: `Bearer ${authToken}` });

const makeWorkflow = (id = "wf-1") => ({
  id,
  userId: TEST_USER_ID,
  name: "Test Workflow",
  active: false,
  description: null,
  tags: [],
  nodes: [],
  edges: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  executions: [],
  _count: { executions: 0 },
});

describe("GET /workflows", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with an items array", async () => {
    mockWorkflow.findMany.mockResolvedValue([makeWorkflow()]);

    const res = await request(app)
      .get("/workflows")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/workflows");
    expect(res.status).toBe(401);
  });
});

describe("POST /workflows", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a workflow and returns 201", async () => {
    const created = makeWorkflow("wf-new");
    mockUser.findUnique.mockResolvedValue({ tenantId: "tenant-1" });
    mockWorkflow.create.mockResolvedValue(created);

    const res = await request(app)
      .post("/workflows")
      .set(authHeader())
      .send({ name: "Test Workflow", nodes: [], edges: [] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "wf-new", name: "Test Workflow" });
  });
});

describe("GET /workflows/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with the workflow", async () => {
    mockWorkflow.findFirst.mockResolvedValue(makeWorkflow("wf-2"));

    const res = await request(app)
      .get("/workflows/wf-2")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "wf-2" });
  });

  it("returns 404 when workflow not found", async () => {
    mockWorkflow.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get("/workflows/nonexistent")
      .set(authHeader());

    expect(res.status).toBe(404);
  });
});

describe("DELETE /workflows/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 204 when workflow is deleted", async () => {
    const wf = makeWorkflow("wf-del");
    mockWorkflow.findFirst.mockResolvedValue(wf);
    mockWorkflow.delete.mockResolvedValue(wf);

    const res = await request(app)
      .delete("/workflows/wf-del")
      .set(authHeader());

    expect(res.status).toBe(204);
  });

  it("returns 404 when workflow not found", async () => {
    mockWorkflow.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete("/workflows/nonexistent")
      .set(authHeader());

    expect(res.status).toBe(404);
  });
});
