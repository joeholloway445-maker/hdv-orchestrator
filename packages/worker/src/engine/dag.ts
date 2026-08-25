import type { Workflow } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import type IORedis from "ioredis";
import { executeNode } from "../nodes";
import { getGlobalVars } from "../lib/globalVars";
import { storePayload, resolvePayload, payloadSummary } from "../lib/payload";

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
  /** If set, successful node outputs from this prior execution seed the checkpoint cache. */
  checkpointExecutionId?: string;
}

async function pub(publisher: IORedis, executionId: string, event: Record<string, unknown>) {
  await publisher.publish("workflow:telemetry", JSON.stringify({ executionId, ...event }));
}

export async function executeWorkflow({ workflow, executionId, triggerData, publisher, prisma, checkpointExecutionId }: Options) {
  const nodes = workflow.nodes as RawNode[];
  const edges = workflow.edges as RawEdge[];

  // Pre-load global variables and attach to trigger data as $vars
  const $vars = await getGlobalVars(prisma, workflow.userId).catch(() => ({}));
  triggerData = { ...triggerData, $vars };

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

  // Checkpoint: pre-seed outputs from a prior execution's successful node logs.
  // Nodes with spilled outputs (stub only in DB) are left pending so they re-run.
  if (checkpointExecutionId) {
    const checkpointLogs = await prisma.executionNodeLog.findMany({
      where: { executionId: checkpointExecutionId, status: "SUCCESS" },
    });
    for (const log of checkpointLogs) {
      const out = log.output as unknown;
      if (out && typeof out === "object" && (out as Record<string, unknown>)._spilled === true) {
        // Can't restore spilled payload after cleanup — let this node re-run
        continue;
      }
      if (nodeStatus[log.nodeId] !== undefined) {
        outputs[log.nodeId] = out;
        nodeStatus[log.nodeId] = "done";
        launched.add(log.nodeId);
      }
    }
    if (checkpointLogs.length > 0) {
      console.log(`[DAG] Checkpoint restored ${Object.keys(outputs).length} node(s) from execution ${checkpointExecutionId}`);
    }
  }

  function isReady(nodeId: string): boolean {
    return parents[nodeId].every((pid) => nodeStatus[pid] === "done" || nodeStatus[pid] === "skipped");
  }

  function cascadeSkip(nodeId: string) {
    if (nodeStatus[nodeId] !== "pending") return;
    nodeStatus[nodeId] = "skipped";
    const node = nodes.find((n) => n.id === nodeId);
    const nodeType = String(node?.data?.nodeType || node?.type || "unknown");
    pub(publisher, executionId, { type: "node-skipped", nodeId, nodeType }).catch(() => {});
    for (const childId of children[nodeId]) cascadeSkip(childId);
  }

  // Returns true if the node has an error-handle edge and routing succeeded
  function hasErrorEdge(nodeId: string): boolean {
    return edges.some((e) => e.source === nodeId && (e.sourceHandle === "error" || e.label === "error"));
  }

  async function processNode(nodeId: string): Promise<void> {
    if (launched.has(nodeId)) return;
    launched.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const nodeType = String(node.data?.nodeType || node.type || "unknown");

    // Gather inputs from parent outputs, resolving any spill refs
    const parentOuts = await Promise.all(
      parents[nodeId]
        .filter((pid) => nodeStatus[pid] === "done")
        .map((pid) => resolvePayload(outputs[pid]))
    );
    const filtered = parentOuts.filter((o) => o !== undefined);
    const $input: Record<string, unknown> =
      filtered.length === 1
        ? (filtered[0] as Record<string, unknown>)
        : filtered.length > 1
          ? { items: filtered }
          : triggerData;

    nodeStatus[nodeId] = "running";
    await pub(publisher, executionId, { type: "node-started", nodeId, nodeType });

    const logEntry = await prisma.executionNodeLog.create({
      data: { executionId, nodeId, nodeType, status: "RUNNING", input: payloadSummary($input) as object },
    });

    try {
      // Pinned data short-circuits actual execution for testing
      const pinnedRaw = node.data._pinnedData;
      const rawOutput = pinnedRaw
        ? (typeof pinnedRaw === "string" ? JSON.parse(pinnedRaw) : pinnedRaw)
        : await executeNode(node, $input, prisma);
      // Spill large outputs to disk; store ref or value in the outputs map
      const output = await storePayload(executionId, nodeId, rawOutput);
      outputs[nodeId] = output;
      nodeStatus[nodeId] = "done";

      await pub(publisher, executionId, { type: "node-finished", nodeId, nodeType, output: payloadSummary(output) });
      await prisma.executionNodeLog.update({
        where: { id: logEntry.id },
        data: { status: "SUCCESS", output: payloadSummary(rawOutput) as object, finishedAt: new Date() },
      });

      // Determine active routing handle (IF branch / Switch)
      let activeHandle: string | null = null;
      if (nodeType === "ifBranch") {
        activeHandle = ((output as Record<string, unknown>)?._branch as string) ?? "true";
      } else if (nodeType === "switch") {
        activeHandle = ((output as Record<string, unknown>)?._switch as string) ?? "default";
      }

      // Schedule ready children
      const nextNodes: string[] = [];
      for (const childId of children[nodeId]) {
        if (activeHandle !== null) {
          const edge = edges.find((e) => e.source === nodeId && e.target === childId);
          const handle = edge?.sourceHandle ?? edge?.label ?? "true";
          if (handle === "error") continue; // never route error handle on success
          if (handle !== activeHandle) {
            cascadeSkip(childId);
            continue;
          }
        } else {
          // Skip error-handle children on success path
          const edge = edges.find((e) => e.source === nodeId && e.target === childId);
          if (edge?.sourceHandle === "error" || edge?.label === "error") continue;
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

      // Route to error branch if one exists
      if (hasErrorEdge(nodeId)) {
        outputs[nodeId] = { ...$input, _error: msg };
        nodeStatus[nodeId] = "done"; // allow error branch children to run
        const errorChildren = edges
          .filter((e) => e.source === nodeId && (e.sourceHandle === "error" || e.label === "error"))
          .map((e) => e.target)
          .filter((childId) => !launched.has(childId) && isReady(childId));
        await Promise.all(errorChildren.map(processNode));
      } else {
        throw error;
      }
    }
  }

  const roots = nodes.filter((n) => parents[n.id].length === 0);
  await Promise.all(roots.map((n) => processNode(n.id)));

  return outputs;
}
