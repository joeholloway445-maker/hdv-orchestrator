import axios from "axios";
import FormData from "form-data";
import dns from "dns/promises";
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

function isPrivateIp(ip: string): boolean {
  // IPv4 private/loopback/link-local ranges
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  return (
    a === 127 ||                              // 127.0.0.0/8 loopback
    a === 10 ||                              // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) ||    // 172.16.0.0/12
    (a === 192 && b === 168) ||             // 192.168.0.0/16
    (a === 169 && b === 254)               // 169.254.0.0/16 link-local
  );
}

async function assertPublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`HTTP Request node: invalid URL "${rawUrl}"`);
  }
  const { hostname } = parsed;
  // Resolve hostname to IP(s) and block if any resolve to a private address
  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new Error(`HTTP Request node: could not resolve hostname "${hostname}"`);
  }
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error(`HTTP Request node: requests to private/loopback addresses are not allowed`);
    }
  }
}

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
    credentialInject?: "header" | "query" | "bearer" | "oauth2";
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
  await assertPublicUrl(resolvedUrl);

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
      } else if (mode === "query" && credData.paramName && credData.paramValue) {
        resolvedParams[credData.paramName] = credData.paramValue;
      } else if (mode === "oauth2" && credData.clientId && credData.clientSecret && credData.tokenUrl) {
        // Client credentials grant — fetch a fresh token before the request
        const tokenResp = await fetch(credData.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: credData.clientId,
            client_secret: credData.clientSecret,
            ...(credData.scope ? { scope: credData.scope } : {}),
          }).toString(),
        });
        if (tokenResp.ok) {
          const tokenData = await tokenResp.json() as { access_token?: string };
          if (tokenData.access_token) {
            resolvedHeaders["Authorization"] = `Bearer ${tokenData.access_token}`;
          }
        }
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
