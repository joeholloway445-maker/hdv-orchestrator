import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from "@prisma/client";
import { verifyToken, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

router.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await bcrypt.hash(password, 10);
  // Auto-assign a tenantId at registration so every user is tenant-ready from day one.
  const tenantId = uuidv4();
  const user = await prisma.user.create({ data: { email, passwordHash, tenantId } });
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: "7d" });

  res.status(201).json({ token, user: { id: user.id, email: user.email, tenantId: user.tenantId } });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const isAdmin = !!(process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL);
  const token = jwt.sign({ userId: user.id, isAdmin }, process.env.JWT_SECRET!, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, email: user.email, isAdmin } });
});

export { router as authRouter };

// ---------------------------------------------------------------------------
// Tenants router — mounted at /tenants in index.ts
// ---------------------------------------------------------------------------
const tenantsRouter = Router();

/**
 * POST /tenants/provision
 * Idempotently ensures the calling user has a tenantId.
 * If they already have one, returns it unchanged.
 */
tenantsRouter.post("/provision", verifyToken, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.tenantId) {
    return res.json({ tenantId: user.tenantId, provisioned: false });
  }

  const tenantId = uuidv4();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { tenantId },
  });
  return res.status(201).json({ tenantId: updated.tenantId, provisioned: true });
});

export { tenantsRouter };
