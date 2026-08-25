import { PrismaClient } from "@prisma/client";
import { executeWebhookTrigger } from "./webhook";
import { executeHttpRequest } from "./http";
import { executeCode } from "./code";
import { executeIfBranch } from "./ifBranch";
import { executeSet } from "./set";
import { executeMemoryRead, executeMemoryWrite } from "./memory";

interface NodeDef {
  id: string;
  type?: string;
  data: Record<string, unknown>;
}

export async function executeNode(
  node: NodeDef,
  $input: Record<string, unknown>,
  prisma?: PrismaClient
): Promise<unknown> {
  const nodeType = String(node.data?.nodeType || node.type || "");
  switch (nodeType) {
    case "webhookTrigger":
    case "manualTrigger":
      return executeWebhookTrigger(node, $input);
    case "httpRequest":
      return executeHttpRequest(node, $input);
    case "code":
      return executeCode(node, $input);
    case "ifBranch":
      return executeIfBranch(node, $input);
    case "set":
      return executeSet(node, $input);
    case "merge":
      // Merge just passes through input (DAG already merged parent outputs into { items: [...] })
      return $input;
    case "memoryRead":
      return executeMemoryRead(node, $input, prisma!);
    case "memoryWrite":
      return executeMemoryWrite(node, $input, prisma!);
    default:
      throw new Error(`Unknown node type: "${nodeType}"`);
  }
}
