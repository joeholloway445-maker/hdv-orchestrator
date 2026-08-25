import axios from "axios";
import FormData from "form-data";
import { PrismaClient } from "@prisma/client";
import { decrypt } from "../lib/crypto";
import { interpolate as _interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  const result = _interpolate(template, data as Record<string, unknown>);
  return result !== undefined && result !== null ? String(result) : "";
}

interface KVPair { key: string; value: string }

export async function executeHttpRequest(
  node: NodeDef,
  $input: unknown,
  prisma?: PrismaClient,
): Promise<unknown> {
  const {
    method = "GET",
    url,
    headers = {},
    body,
    credentialId,
    credentialInject,
    queryParams = [],
    customHeaders = [],
    timeout: rawTimeout,
    contentType = "json",
    formFields = [],
  } = node.data as {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string;
    credentialId?: string;
    credentialInject?: "header" | "query" | "bearer";
    queryParams?: KVPair[];
    customHeaders?: KVPair[];
    timeout?: string | number;
    contentType?: "json" | "form" | "urlencoded" | "raw";
    formFields?: KVPair[];
  };
  const timeoutMs = rawTimeout ? parseInt(String(rawTimeout), 10) : 30000;
  const retryCount = node.data.retryCount ? parseInt(String(node.data.retryCount), 10) : 0;
  const retryDelay = node.data.retryDelay ? parseInt(String(node.data.retryDelay), 10) : 1000;

  if (!url) throw new Error("HTTP Request node: url is required");

  const resolvedUrl = interpolate(url, $input);

  let resolvedBody: unknown;
  if (contentType === "form") {
    const fd = new FormData();
    for (const f of formFields) {
      if (f.key) fd.append(interpolate(f.key, $input), interpolate(f.value, $input));
    }
    resolvedBody = fd;
  } else if (contentType === "urlencoded") {
    const params = new URLSearchParams();
    for (const f of formFields) {
      if (f.key) params.append(interpolate(f.key, $input), interpolate(f.value, $input));
    }
    resolvedBody = params.toString();
  } else if (contentType === "raw") {
    resolvedBody = body ? interpolate(body, $input) : undefined;
  } else {
    // json (default)
    resolvedBody = body ? JSON.parse(interpolate(body, $input)) : undefined;
  }

  const resolvedHeaders: Record<string, string> = { ...headers };
  // Apply custom headers with interpolation
  for (const h of customHeaders) {
    if (h.key) resolvedHeaders[interpolate(h.key, $input)] = interpolate(h.value, $input);
  }

  // Build query params
  const resolvedParams: Record<string, string> = {};
  for (const p of queryParams) {
    if (p.key) resolvedParams[interpolate(p.key, $input)] = interpolate(p.value, $input);
  }

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

  const axiosConfig = {
    method,
    url: resolvedUrl,
    headers: resolvedHeaders,
    params: Object.keys(resolvedParams).length ? resolvedParams : undefined,
    data: resolvedBody,
    timeout: timeoutMs,
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const response = await axios(axiosConfig);
      return { status: response.status, headers: response.headers, body: response.data };
    } catch (err: unknown) {
      lastError = err;
      if (attempt < retryCount) {
        await new Promise((r) => setTimeout(r, retryDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}
