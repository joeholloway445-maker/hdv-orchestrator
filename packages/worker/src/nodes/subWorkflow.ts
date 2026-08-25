import { PrismaClient } from "@prisma/client";
import { enqueueWorkflow } from "../queue";

interface NodeDef {
  data: Record<string, unknown>;
}

export async function executeSubWorkflow(
  node: NodeDef,
  $input: Record<string, unknown>,
  prisma: PrismaClient,
): Promise<unknown> {
  const targetId = String(node.data?.targetWorkflowId || "");
  if (!targetId) throw new Error("Sub-workflow node: targetWorkflowId is required");

  const wf = await prisma.workflow.findUnique({ where: { id: targetId } });
  if (!wf) throw new Error(`Sub-workflow not found: ${targetId}`);

  const execution = await prisma.execution.create({
    data: { workflowId: targetId, status: "PENDING", data: { triggerData: $input } },
  });

  await enqueueWorkflow({ workflowId: targetId, executionId: execution.id, triggerData: $input });

  return { ...$input, subExecutionId: execution.id, subWorkflowId: targetId };
}
