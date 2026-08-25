import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { decrypt } from "../lib/crypto";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, key: string) => {
    const val = key
      .trim()
      .split(".")
      .reduce((obj: unknown, k: string) => (obj && typeof obj === "object" ? (obj as Record<string, unknown>)[k] : undefined), data);
    return val !== undefined ? String(val) : "";
  });
}

export async function executeHttpRequest(
  node: NodeDef,
  $input: unknown,
  prisma?: PrismaClient,
): Promise<unknown> {
  const { method = "GET", url, headers = {}, body, credentialId, credentialInject } = node.data as {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string;
    credentialId?: string;
    credentialInject?: "header" | "query" | "bearer";
  };

  if (!url) throw new Error("HTTP Request node: url is required");

  const resolvedUrl = interpolate(url, $input);
  const resolvedBody = body ? JSON.parse(interpolate(body, $input)) : undefined;

  const resolvedHeaders: Record<string, string> = { ...headers };

  // Inject credential if configured
  if (credentialId && prisma) {
    const cred = await prisma.credential.findUnique({ where: { id: credentialId } });
    if (cred) {
      const credData = JSON.parse(decrypt(cred.data)) as Record<string, string>;
      const mode = credentialInject || "bearer";
      if (mode === "bearer" && credData.token) {
        resolvedHeaders["Authorization"] = `Bearer ${credData.token}`;
      } else if (mode === "header" && credData.headerName && credData.headerValue) {
        resolvedHeaders[credData.headerName] = credData.headerValue;
      }
    }
  }

  const response = await axios({
    method,
    url: resolvedUrl,
    headers: resolvedHeaders,
    data: resolvedBody,
    timeout: 30000,
  });

  return { status: response.status, headers: response.headers, body: response.data };
}
