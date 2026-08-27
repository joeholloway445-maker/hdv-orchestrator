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
import { executeAI } from "./ai";
import { executeAggregate } from "./aggregate";
import { executeTransform } from "./transform";
import { executeDatetime } from "./datetime";
import { executeCrypto } from "./crypto";
import { executeSplitBatches } from "./splitBatches";
import { executeValidate } from "./validate";
import { executeCSV } from "./csv";
import { executeHtmlExtract } from "./html";
import { executeJsonPath } from "./jsonPath";
import { executeStopError } from "./stopError";
import { executeMerge } from "./merge";
import { executeDatabase } from "./database";
import { executeSlack } from "./slack";
import { executeXml } from "./xml";
import { executeRss } from "./rss";
import { executeDeduplicate } from "./deduplicate";
import { executeSort } from "./sort";
import { executeLimit } from "./limit";
import { executeRenameKeys } from "./renameKeys";
import { executeApexDispatch } from "./apex";
import { executeKnoll } from "./knoll";
import { executeDream } from "./dream";
import { executeVision } from "./vision";
import { executeHope } from "./hope";
import { getAgent } from "../hdv/agents/registry.js";
import { globalChain } from "../hdv/audit/hash_chain.js";

interface NodeDef {
  id: string;
  type?: string;
  data: Record<string, unknown>;
}

/**
 * Public executor — routes studio node types through the HDV agent registry,
 * appends KNOLL verdicts to the tamper-evident audit chain, then falls back
 * to the core switch for all other node types.
 */
export async function executeNode(
  node: NodeDef,
  $input: Record<string, unknown>,
  prisma?: PrismaClient,
  executionDepth = 0,
): Promise<unknown> {
  const nodeType = String(node.data?.nodeType || node.type || "");
  const agent = getAgent(nodeType);

  if (agent) {
    const message = await agent.process({ ...$input, _nodeId: node.id, _nodeData: node.data });
    const output: Record<string, unknown> = {
      ...$input,
      ...(message?.content && typeof message.content === "object" ? message.content as Record<string, unknown> : { agentText: message?.content }),
      _agentId: message?.from,
    };

    // KNOLL: record verdict in the tamper-evident chain; block if denied
    if (nodeType === "knoll") {
      const verdict = String((output as Record<string, unknown>)._knollAudit
        ? JSON.stringify((output as Record<string, unknown>)._knollAudit)
        : "pass");
      const tenantId = String(node.data?.tenantId ?? "");
      globalChain.append(node.id, verdict, tenantId || undefined);
      if ((output as Record<string, unknown>).denied) {
        return { ...$input, _blocked: true, _blockReason: output.reason ?? "KNOLL denied" };
      }
    }

    return output;
  }

  return executeNodeCore(node, $input, prisma, executionDepth);
}

async function executeNodeCore(
  node: NodeDef,
  $input: Record<string, unknown>,
  prisma?: PrismaClient,
  executionDepth = 0,
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
      return executeMerge(node, $input);
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
      return executeSubWorkflow(node, $input, prisma!, executionDepth);
    case "respond":
      return executeRespond(node, $input);
    case "memoryRead":
      return executeMemoryRead(node, $input, prisma!);
    case "memoryWrite":
      return executeMemoryWrite(node, $input, prisma!);
    case "ai":
      return executeAI(node, $input);
    case "aggregate":
      return executeAggregate(node, $input);
    case "transform":
      return executeTransform(node, $input);
    case "datetime":
      return executeDatetime(node, $input);
    case "crypto":
      return executeCrypto(node, $input);
    case "splitBatches":
      return executeSplitBatches(node, $input);
    case "validate":
      return executeValidate(node, $input);
    case "noOp":
      return $input;
    case "stopError":
      return executeStopError(node, $input);
    case "jsonPath":
      return executeJsonPath(node, $input);
    case "csv":
      return executeCSV(node, $input);
    case "htmlExtract":
      return executeHtmlExtract(node, $input);
    case "database":
      return executeDatabase(node, $input, prisma);
    case "slack":
      return executeSlack(node, $input);
    case "xml":
      return executeXml(node, $input);
    case "rss":
      return executeRss(node, $input);
    case "deduplicate":
      return executeDeduplicate(node, $input);
    case "sort":
      return executeSort(node, $input);
    case "limit":
      return executeLimit(node, $input);
    case "renameKeys":
      return executeRenameKeys(node, $input);
    case "stickyNote":
      return $input; // pass-through annotation node
    // HDV Big Five agent nodes
    case "apex":
      return executeApexDispatch(node, $input);
    case "knoll":
      return executeKnoll(node, $input);
    case "dream":
      return executeDream(node, $input);
    case "vision":
      return executeVision(node, $input);
    case "hope":
      return executeHope(node, $input);
    default:
      throw new Error(`Unknown node type: "${nodeType}"`);
  }
}
