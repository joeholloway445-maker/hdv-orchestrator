import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

router.get("/", async (req: AuthRequest, res) => {
  const { workflowId } = req.query as { workflowId?: string };
  const items = await prisma.userMemory.findMany({
    where: { userId: req.userId!, workflowId: workflowId ?? "" },
    orderBy: { key: "asc" },
  });
  res.json(items);
});

router.put("/:key", async (req: AuthRequest, res) => {
  const { value, workflowId } = req.body as { value: unknown; workflowId?: string };
  const scopeId = workflowId ?? "";
  const item = await prisma.userMemory.upsert({
    where: { userId_key_workflowId: { userId: req.userId!, key: req.params.key, workflowId: scopeId } },
    create: { userId: req.userId!, key: req.params.key, value: JSON.parse(JSON.stringify(value)), workflowId: scopeId },
    update: { value: JSON.parse(JSON.stringify(value)) },
  });
  res.json(item);
});

router.delete("/:key", async (req: AuthRequest, res) => {
  const { workflowId } = req.query as { workflowId?: string };
  await prisma.userMemory.deleteMany({
    where: { userId: req.userId!, key: req.params.key, workflowId: workflowId ?? "" },
  });
  res.json({ ok: true });
});

export { router as memoryRouter };
