import type { Workflow } from "@prisma/client";
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
}

interface Options {
  workflow: Workflow;
  executionId: string;
  triggerData: Record<string, unknown>;
  publisher: IORedis;
}

async function pub(publisher: IORedis, executionId: string, event: Record<string, unknown>) {
  await publisher.publish("workflow:telemetry", JSON.stringify({ executionId, ...event }));
}

export async function executeWorkflow({ workflow, executionId, triggerData, publisher }: Options) {
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

  // Trigger node: first node with no parents
  const triggerNode = nodes.find((n) => parents[n.id]?.length === 0);
  if (!triggerNode) throw new Error("No trigger node found (no node with zero parents)");

  const outputs: Record<string, unknown> = {};
  const visited = new Set<string>();
  const queue: string[] = [triggerNode.id];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    const parentOuts = parents[nodeId].map((pid) => outputs[pid]).filter(Boolean);
    const $input = parentOuts.length === 1 ? parentOuts[0] : parentOuts.length > 1 ? parentOuts : triggerData;

    const nodeType = String(node.data?.nodeType || node.type || "unknown");
    await pub(publisher, executionId, { type: "node-started", nodeId, nodeType });

    try {
      const output = await executeNode(node, $input as Record<string, unknown>);
      outputs[nodeId] = output;
      await pub(publisher, executionId, { type: "node-finished", nodeId, nodeType, output });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      await pub(publisher, executionId, { type: "node-error", nodeId, nodeType, error: msg });
      throw error;
    }

    for (const childId of children[nodeId]) {
      if (!visited.has(childId)) queue.push(childId);
    }
  }

  return outputs;
}
