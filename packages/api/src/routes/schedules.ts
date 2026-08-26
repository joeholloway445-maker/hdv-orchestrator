import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

interface RawNode {
  id: string;
  data: Record<string, unknown>;
}

router.get("/", async (req: AuthRequest, res) => {
  const workflows = await prisma.workflow.findMany({
    where: { userId: req.userId! },
    orderBy: { updatedAt: "desc" },
    include: {
      executions: {
        where: { data: { path: ["_trigger"], equals: "schedule" } },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { startedAt: true, status: true },
      },
    },
  });

  const schedules = workflows
    .map((wf: {
      id: string;
      name: string;
      active: boolean;
      nodes: unknown;
      executions: Array<{ startedAt: Date; status: string }>;
    }) => {
      const nodes = wf.nodes as RawNode[];
      const schedNode = nodes.find((n) => n.data?.nodeType === "scheduleTrigger");
      if (!schedNode) return null;
      const expr = String(schedNode.data?.cronExpression || "");
      if (!expr) return null;
      const timezone = schedNode.data?.timezone ? String(schedNode.data.timezone) : "UTC";
      const lastRun = wf.executions[0] ?? null;
      return {
        workflowId: wf.id,
        workflowName: wf.name,
        active: wf.active,
        cronExpression: expr,
        timezone,
        lastRun: lastRun
          ? { startedAt: lastRun.startedAt, status: lastRun.status }
          : null,
      };
    })
    .filter(Boolean);

  res.json(schedules);
});

export { router as schedulesRouter };
