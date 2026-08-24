import { executeWebhookTrigger } from "./webhook";
import { executeHttpRequest } from "./http";
import { executeCode } from "./code";

interface NodeDef {
  id: string;
  type?: string;
  data: Record<string, unknown>;
}

export async function executeNode(node: NodeDef, $input: Record<string, unknown>): Promise<unknown> {
  const nodeType = String(node.data?.nodeType || node.type || "");
  switch (nodeType) {
    case "webhookTrigger":
      return executeWebhookTrigger(node, $input);
    case "httpRequest":
      return executeHttpRequest(node, $input);
    case "code":
      return executeCode(node, $input);
    default:
      throw new Error(`Unknown node type: "${nodeType}"`);
  }
}
