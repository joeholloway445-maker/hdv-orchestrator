import { PrismaClient } from "@prisma/client";
import { enqueueWorkflow } from "../queue";

const MAX_SUBWORKFLOW_DEPTH = Number(process.env.SUBWORKFLOW_MAX_DEPTH) || 5;

interface NodeDef {
  data: Record<string, unknown>;
}

export async function executeSubWorkflow(
  node: NodeDef,
  $input: Record<string, unknown>,
  prisma: PrismaClient,
  executionDepth = 0,
): Promise<unknown> {
  if (executionDepth >= MAX_SUBWORKFLOW_DEPTH) {
    throw new Error(
      `Sub-workflow recursion limit reached (max depth ${MAX_SUBWORKFLOW_DEPTH}). ` +
      `Check for circular workflow references.`,
    );
  }

  const targetId = String(node.data?.targetWorkflowId || "");
  if (!targetId) throw new Error("Sub-workflow node: targetWorkflowId is required");

  const wf = await prisma.workflow.findUnique({ where: { id: targetId } });
  if (!wf) throw new Error(`Sub-workflow not found: ${targetId}`);

  const execution = await prisma.execution.create({
    data: { workflowId: targetId, status: "PENDING", data: { triggerData: $input } },
  });

  // Async yield — enqueue child and return immediately rather than blocking.
  // The child runs on the same queue; parent does not wait for its completion.
  await enqueueWorkflow({
    workflowId: targetId,
    executionId: execution.id,
    triggerData: $input,
    executionDepth: executionDepth + 1,
  });

  return { ...$input, subExecutionId: execution.id, subWorkflowId: targetId };
}
