import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

// ── Hoist shared mock objects so they're accessible inside vi.mock ─────────
const { mockUser } = vi.hoisted(() => ({
  mockUser: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

// ── Prisma mock — regular function so `new PrismaClient()` works ───────────
vi.mock("@prisma/client", () => {
  function PrismaClient() {
    return {
      user: mockUser,
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

const TEST_EMAIL = "testuser@example.com";
const TEST_PASSWORD = "SuperSecret123";

describe("POST /auth/register", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers a new user and returns a JWT token", async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({
      id: "user-cuid-1",
      email: TEST_EMAIL,
      tenantId: "tenant-cuid-1",
    });

    const res = await request(app)
      .post("/auth/register")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("token");
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user).toMatchObject({ email: TEST_EMAIL });
  });

  it("returns 409 when email already registered", async () => {
    mockUser.findUnique.mockResolvedValue({ id: "user-cuid-1", email: TEST_EMAIL });

    const res = await request(app)
      .post("/auth/register")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(409);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: TEST_EMAIL });

    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and a token for valid credentials", async () => {
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    mockUser.findUnique.mockResolvedValue({
      id: "user-cuid-1",
      email: TEST_EMAIL,
      passwordHash: hash,
    });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(typeof res.body.token).toBe("string");
  });

  it("returns 401 for wrong password", async () => {
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    mockUser.findUnique.mockResolvedValue({
      id: "user-cuid-1",
      email: TEST_EMAIL,
      passwordHash: hash,
    });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: TEST_EMAIL, password: "wrong-password" });

    expect(res.status).toBe(401);
  });

  it("returns 401 for unknown email", async () => {
    mockUser.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });
});
