import { PrismaClient } from "@prisma/client";
import { executeWebhookTrigger } from "./webhook";
import { executeHttpRequest } from "./http";
import { executeCode } from "./code";
import { executeIfBranch } from "./ifBranch";
import { executeSet } from "./set";
import { executeMemoryRead, executeMemoryWrite } from "./memory";
import { executeLoop } from "./loop";
import { executeWait } from "./wait";
import { executeFilter } from "./filter";
import { executeSwitch } from "./switch";
import { executeEmail } from "./email";
import { executeSubWorkflow } from "./subWorkflow";
import { executeRespond } from "./respond";

interface NodeDef {
  id: string;
  type?: string;
  data: Record<string, unknown>;
}

export async function executeNode(
  node: NodeDef,
  $input: Record<string, unknown>,
  prisma?: PrismaClient,
): Promise<unknown> {
  const nodeType = String(node.data?.nodeType || node.type || "");
  switch (nodeType) {
    case "webhookTrigger":
    case "manualTrigger":
    case "scheduleTrigger":
      return executeWebhookTrigger(node, $input);
    case "httpRequest":
      return executeHttpRequest(node, $input, prisma);
    case "code":
      return executeCode(node, $input);
    case "ifBranch":
      return executeIfBranch(node, $input);
    case "set":
      return executeSet(node, $input);
    case "merge":
      return $input;
    case "loop":
      return executeLoop(node, $input);
    case "wait":
      return executeWait(node, $input);
    case "filter":
      return executeFilter(node, $input);
    case "switch":
      return executeSwitch(node, $input);
    case "email":
      return executeEmail(node, $input);
    case "subWorkflow":
      return executeSubWorkflow(node, $input, prisma!);
    case "respond":
      return executeRespond(node, $input);
    case "memoryRead":
      return executeMemoryRead(node, $input, prisma!);
    case "memoryWrite":
      return executeMemoryWrite(node, $input, prisma!);
    default:
      throw new Error(`Unknown node type: "${nodeType}"`);
  }
}
