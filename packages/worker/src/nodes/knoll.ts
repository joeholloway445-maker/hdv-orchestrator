/**
 * KNOLL audit node — validates the current workflow data against HDV security laws.
 *
 * KNOLL is the silent sentinel: it never modifies data, only ALLOWS or BLOCKS the
 * execution path. When KNOLL blocks, the node throws — the workflow engine marks it
 * FAILED and the execution halts.
 *
 * Configurable checks (all enabled by default):
 *   - `checkPayloadSize`    : reject $input objects exceeding maxPayloadKb
 *   - `checkForbiddenKeys`  : reject $input containing sensitive key patterns
 *   - `checkSsrf`           : reject HTTP URLs that target private IP ranges
 *   - `checkEntropyScore`   : block suspiciously high-entropy strings (potential exfil)
 *   - `checkMaliciousIntent`: block payloads containing shell/SQL/fork-bomb patterns
 *   - `auditLabel`          : tag every audit log entry with this label
 *
 * All blocked decisions are recorded in a tamper-evident hash-chain (globalAuditChain).
 */
import { interpolate as _interpolate } from "../lib/expr";
import { globalAuditLog } from "../hdv/audit.js";
import { globalAuditChain } from "../hdv/hashchain.js";

interface NodeDef {
  data: Record<string, unknown>;
}

// Patterns that indicate sensitive keys being passed through
const FORBIDDEN_KEY_PATTERNS = [
  /password/i, /secret/i, /private_key/i, /private-key/i, /creditcard/i, /credit_card/i,
  /ssn/i, /social_security/i, /cvv/i,
];

// Malicious-intent heuristics (from HDV_Foundation/knoll/laws.ts)
const MALICIOUS_PATTERNS: readonly RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bdrop\s+table\b/i,
  /\bdelete\s+from\b/i,
  /;\s*shutdown\b/i,
  /\bexfiltrate\b/i,
  /\bsteal\s+(?:credentials|secrets|tokens|passwords)\b/i,
  /\b(?:disable|bypass|kill)\s+knoll\b/i,
  /\bfork\s*bomb\b/i,
  /:\(\)\s*\{.*\}\s*;\s*:/,
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

function findForbiddenKeys(obj: unknown, extraPatterns: RegExp[] = []): string[] {
  const patterns = [...FORBIDDEN_KEY_PATTERNS, ...extraPatterns];
  const hits: string[] = [];
  function walk(v: unknown) {
    if (v && typeof v === "object") {
      for (const key of Object.keys(v as Record<string, unknown>)) {
        if (patterns.some((p) => p.test(key))) hits.push(key);
        walk((v as Record<string, unknown>)[key]);
      }
    }
  }
  walk(obj);
  return hits;
}

function collectStrings(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (Array.isArray(obj)) return obj.flatMap(collectStrings);
  if (obj !== null && typeof obj === "object") {
    return Object.values(obj as Record<string, unknown>).flatMap(collectStrings);
  }
  return [];
}

function checkMaliciousIntentPatterns(obj: unknown): string[] {
  const haystack = collectStrings(obj).join(" \n ");
  return MALICIOUS_PATTERNS
    .filter((p) => p.test(haystack))
    .map((p) => String(p));
}

export async function executeKnoll(
  node: NodeDef,
  $input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const auditLabel = String(node.data?.auditLabel || "knoll-audit");
  const checkPayloadSize = node.data?.checkPayloadSize !== false;
  const checkForbiddenKeys = node.data?.checkForbiddenKeys !== false;
  const checkSsrf = node.data?.checkSsrf !== false;
  const checkEntropyScore = node.data?.checkEntropyScore === true || node.data?.checkEntropy === true;
  const checkMalicious = node.data?.checkMaliciousIntent !== false;
  const maxPayloadKb = parseInt(String(node.data?.maxPayloadKb || "512"), 10);
  const entropyThreshold = parseFloat(String(node.data?.entropyThreshold || node.data?.maxEntropyBits || "5.5"));
  const entropyMinLen = parseInt(String(node.data?.entropyMinLen || "64"), 10);

  const extraForbidKeys = String(node.data?.forbidKeys || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

  const violations: string[] = [];

  if (checkPayloadSize) {
    const payloadBytes = JSON.stringify($input).length;
    if (payloadBytes > maxPayloadKb * 1024) {
      violations.push(`Payload size ${(payloadBytes / 1024).toFixed(1)} KB exceeds limit ${maxPayloadKb} KB`);
    }
  }

  if (checkForbiddenKeys) {
    const forbidden = findForbiddenKeys($input, extraForbidKeys);
    if (forbidden.length > 0) {
      violations.push(`Forbidden keys detected: ${forbidden.slice(0, 5).join(", ")}`);
    }
  }

  if (checkSsrf) {
    const ssrfUrls = findSsrfUrls($input);
    if (ssrfUrls.length > 0) {
      violations.push(`SSRF risk: private-range URLs in payload: ${ssrfUrls.slice(0, 3).join(", ")}`);
    }
  }

  if (checkEntropyScore) {
    const highEntropy = findHighEntropyStrings($input, entropyThreshold, entropyMinLen);
    if (highEntropy.length > 0) {
      violations.push(`High-entropy strings detected (possible exfil): ${highEntropy.slice(0, 2).join(", ")}…`);
    }
  }

  if (checkMalicious) {
    const patterns = checkMaliciousIntentPatterns($input);
    if (patterns.length > 0) {
      violations.push(`Malicious intent detected: ${patterns.slice(0, 2).join(", ")}`);
    }
  }

  const execObj = $input.$execution as Record<string, unknown> | undefined;
  const packetId = String($input._executionId || execObj?.id || auditLabel + "-" + Date.now());

  if (violations.length > 0) {
    const summary = violations.join("; ");
    // Record BLOCKED in audit log + hash-chain
    const entry = globalAuditLog.record(packetId, "BLOCKED", summary);
    globalAuditChain.append(entry);
    throw new Error(`KNOLL [${auditLabel}] BLOCKED — ${summary}`);
  }

  // Record ALLOWED in audit log + hash-chain
  const entry = globalAuditLog.record(packetId, "ALLOWED");
  globalAuditChain.append(entry);

  return {
    ...$input,
    _knollAudit: {
      label: auditLabel,
      passed: true,
      timestamp: new Date().toISOString(),
      chainHead: globalAuditChain.head(),
      checks: {
        payloadSize: checkPayloadSize,
        forbiddenKeys: checkForbiddenKeys,
        ssrf: checkSsrf,
        entropy: checkEntropyScore,
        maliciousIntent: checkMalicious,
      },
    },
  };
}
