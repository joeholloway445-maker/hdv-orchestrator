import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

router.get("/", async (req: AuthRequest, res) => {
  const vars = await (prisma as any).globalVariable.findMany({
    where: { userId: req.userId! },
    orderBy: { key: "asc" },
  });
  res.json(vars);
});

router.put("/:key", async (req: AuthRequest, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: "value required" });

  const variable = await (prisma as any).globalVariable.upsert({
    where: { userId_key: { userId: req.userId!, key: req.params.key } },
    create: { userId: req.userId!, key: req.params.key, value },
    update: { value },
  });
  res.json(variable);
});

router.delete("/:key", async (req: AuthRequest, res) => {
  const existing = await (prisma as any).globalVariable.findUnique({
    where: { userId_key: { userId: req.userId!, key: req.params.key } },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await (prisma as any).globalVariable.delete({
    where: { userId_key: { userId: req.userId!, key: req.params.key } },
  });
  res.status(204).send();
});

export { router as variablesRouter };
