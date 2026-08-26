/**
 * KNOLL audit node — validates the current workflow data against HDV security laws.
 *
 * KNOLL is the silent sentinel: it never modifies data, only ALLOWS or BLOCKS the
 * execution path. When KNOLL blocks, the node throws — the workflow engine marks it
 * FAILED and the execution halts.
 *
 * Configurable checks (all enabled by default):
 *   - `checkPayloadSize`  : reject $input objects exceeding maxPayloadKb
 *   - `checkForbiddenKeys`: reject $input containing sensitive key patterns
 *   - `checkSsrf`         : reject HTTP URLs that target private IP ranges
 *   - `checkEntropyScore` : block suspiciously high-entropy strings (potential exfil)
 *   - `auditLabel`        : tag every audit log entry with this label
 */
import { interpolate as _interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

// Patterns that indicate sensitive keys being passed through
const FORBIDDEN_KEY_PATTERNS = [
  /password/i, /secret/i, /private_key/i, /private-key/i, /creditcard/i, /credit_card/i,
  /ssn/i, /social_security/i, /cvv/i,
];

// Private IP ranges that should never be reached via HTTP (SSRF prevention)
const PRIVATE_IP_RE = /^(https?:\/\/)(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|::1|fc00:|fd)/i;

function shannonEntropy(s: string): number {
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  const len = s.length;
  return -Object.values(freq).reduce((sum, f) => {
    const p = f / len;
    return sum + p * Math.log2(p);
  }, 0);
}

function findHighEntropyStrings(obj: unknown, threshold: number, minLen: number): string[] {
  const hits: string[] = [];
  function walk(v: unknown) {
    if (typeof v === "string" && v.length >= minLen) {
      if (shannonEntropy(v) > threshold) hits.push(v.slice(0, 40));
    } else if (v && typeof v === "object") {
      for (const val of Object.values(v as Record<string, unknown>)) walk(val);
    }
  }
  walk(obj);
  return hits;
}

function findSsrfUrls(obj: unknown): string[] {
  const hits: string[] = [];
  function walk(v: unknown) {
    if (typeof v === "string" && PRIVATE_IP_RE.test(v)) hits.push(v);
    else if (v && typeof v === "object") {
      for (const val of Object.values(v as Record<string, unknown>)) walk(val);
    }
  }
  walk(obj);
  return hits;
}

function findForbiddenKeys(obj: unknown): string[] {
  const hits: string[] = [];
  function walk(v: unknown) {
    if (v && typeof v === "object") {
      for (const key of Object.keys(v as Record<string, unknown>)) {
        if (FORBIDDEN_KEY_PATTERNS.some((p) => p.test(key))) hits.push(key);
        walk((v as Record<string, unknown>)[key]);
      }
    }
  }
  walk(obj);
  return hits;
}

export async function executeKnoll(
  node: NodeDef,
  $input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const auditLabel = String(node.data?.auditLabel || "knoll-audit");
  const checkPayloadSize = node.data?.checkPayloadSize !== false;
  const checkForbiddenKeys = node.data?.checkForbiddenKeys !== false;
  const checkSsrf = node.data?.checkSsrf !== false;
  const checkEntropyScore = node.data?.checkEntropyScore === true;
  const maxPayloadKb = parseInt(String(node.data?.maxPayloadKb || "512"), 10);
  const entropyThreshold = parseFloat(String(node.data?.entropyThreshold || "5.5"));
  const entropyMinLen = parseInt(String(node.data?.entropyMinLen || "64"), 10);

  const violations: string[] = [];

  // 1. Payload size check
  if (checkPayloadSize) {
    const payloadBytes = JSON.stringify($input).length;
    if (payloadBytes > maxPayloadKb * 1024) {
      violations.push(`Payload size ${(payloadBytes / 1024).toFixed(1)} KB exceeds limit ${maxPayloadKb} KB`);
    }
  }

  // 2. Forbidden key check
  if (checkForbiddenKeys) {
    const forbidden = findForbiddenKeys($input);
    if (forbidden.length > 0) {
      violations.push(`Forbidden keys detected: ${forbidden.slice(0, 5).join(", ")}`);
    }
  }

  // 3. SSRF check
  if (checkSsrf) {
    const ssrfUrls = findSsrfUrls($input);
    if (ssrfUrls.length > 0) {
      violations.push(`SSRF risk: private-range URLs in payload: ${ssrfUrls.slice(0, 3).join(", ")}`);
    }
  }

  // 4. Entropy check (exfil detection)
  if (checkEntropyScore) {
    const highEntropy = findHighEntropyStrings($input, entropyThreshold, entropyMinLen);
    if (highEntropy.length > 0) {
      violations.push(`High-entropy strings detected (possible exfil): ${highEntropy.slice(0, 2).join(", ")}…`);
    }
  }

  if (violations.length > 0) {
    const summary = violations.join("; ");
    throw new Error(`KNOLL [${auditLabel}] BLOCKED — ${summary}`);
  }

  return {
    ...$input,
    _knollAudit: {
      label: auditLabel,
      passed: true,
      timestamp: new Date().toISOString(),
      checks: {
        payloadSize: checkPayloadSize,
        forbiddenKeys: checkForbiddenKeys,
        ssrf: checkSsrf,
        entropy: checkEntropyScore,
      },
    },
  };
}
