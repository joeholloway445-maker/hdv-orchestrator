import type { Workflow } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import type IORedis from "ioredis";
import { executeNode } from "../nodes";

interface RawNode {
  id: string;
  type?: string;
  data: Record<string, unknown>;
}

interface RawEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  label?: string;
}

interface Options {
  workflow: Workflow;
  executionId: string;
  triggerData: Record<string, unknown>;
  publisher: IORedis;
  prisma: PrismaClient;
}

async function pub(publisher: IORedis, executionId: string, event: Record<string, unknown>) {
  await publisher.publish("workflow:telemetry", JSON.stringify({ executionId, ...event }));
}

export async function executeWorkflow({ workflow, executionId, triggerData, publisher, prisma }: Options) {
  const nodes = workflow.nodes as RawNode[];
  const edges = workflow.edges as RawEdge[];

  const children: Record<string, string[]> = {};
  const parents: Record<string, string[]> = {};
  for (const node of nodes) {
    children[node.id] = [];
    parents[node.id] = [];
  }
  for (const edge of edges) {
    children[edge.source]?.push(edge.target);
    parents[edge.target]?.push(edge.source);
  }

  const outputs: Record<string, unknown> = {};
  type NodeStatus = "pending" | "running" | "done" | "skipped" | "error";
  const nodeStatus: Record<string, NodeStatus> = {};
  for (const node of nodes) nodeStatus[node.id] = "pending";

  const launched = new Set<string>();

  function isReady(nodeId: string): boolean {
    return parents[nodeId].every((pid) => nodeStatus[pid] === "done" || nodeStatus[pid] === "skipped");
  }

  function cascadeSkip(nodeId: string) {
    if (nodeStatus[nodeId] !== "pending") return;
    nodeStatus[nodeId] = "skipped";
    for (const childId of children[nodeId]) cascadeSkip(childId);
  }

  async function processNode(nodeId: string): Promise<void> {
    if (launched.has(nodeId)) return;
    launched.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const nodeType = String(node.data?.nodeType || node.type || "unknown");

    // Gather inputs from parent outputs
    const parentOuts = parents[nodeId]
      .filter((pid) => nodeStatus[pid] === "done")
      .map((pid) => outputs[pid])
      .filter((o) => o !== undefined);
    const $input: Record<string, unknown> =
      parentOuts.length === 1
        ? (parentOuts[0] as Record<string, unknown>)
        : parentOuts.length > 1
          ? { items: parentOuts }
          : triggerData;

    nodeStatus[nodeId] = "running";
    await pub(publisher, executionId, { type: "node-started", nodeId, nodeType });

    // Create node log in DB
    const logEntry = await prisma.executionNodeLog.create({
      data: { executionId, nodeId, nodeType, status: "RUNNING", input: $input as object },
    });

    try {
      const output = await executeNode(node, $input, prisma);
      outputs[nodeId] = output;
      nodeStatus[nodeId] = "done";

      await pub(publisher, executionId, { type: "node-finished", nodeId, nodeType, output });
      await prisma.executionNodeLog.update({
        where: { id: logEntry.id },
        data: { status: "SUCCESS", output: output as object, finishedAt: new Date() },
      });

      // Handle IF branch routing
      let activeHandle: string | null = null;
      if (nodeType === "ifBranch") {
        activeHandle = ((output as Record<string, unknown>)?._branch as string) ?? "true";
      }

      // Schedule children that are now ready
      const nextNodes: string[] = [];
      for (const childId of children[nodeId]) {
        if (activeHandle !== null) {
          const edge = edges.find((e) => e.source === nodeId && e.target === childId);
          const handle = edge?.sourceHandle ?? edge?.label ?? "true";
          if (handle !== activeHandle) {
            cascadeSkip(childId);
            continue;
          }
        }
        if (!launched.has(childId) && isReady(childId)) {
          nextNodes.push(childId);
        }
      }
      await Promise.all(nextNodes.map(processNode));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      nodeStatus[nodeId] = "error";
      await pub(publisher, executionId, { type: "node-error", nodeId, nodeType, error: msg });
      await prisma.executionNodeLog.update({
        where: { id: logEntry.id },
        data: { status: "ERROR", error: msg, finishedAt: new Date() },
      });
      throw error;
    }
  }

  // Start with all root nodes (no parents) in parallel
  const roots = nodes.filter((n) => parents[n.id].length === 0);
  await Promise.all(roots.map((n) => processNode(n.id)));

  return outputs;
}
