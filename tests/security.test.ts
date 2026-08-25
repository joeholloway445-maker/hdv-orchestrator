/**
 * tests/security.test.ts — Security regression tests using node:test.
 *
 * Covers:
 *  A. Execution ownership — 403 when requesting another user's execution
 *  B. SSRF guard — private/loopback IPv4 and IPv6 addresses are blocked
 *  C. isPrivateIp boundary cases — 172.x.x.x range edges, link-local
 *  D. Auth header parsing — Bearer prefix required
 *
 * Run: node --require ts-node/register --test tests/security.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import dns from "dns/promises";

// ---------------------------------------------------------------------------
// Helpers — copied logic from route/middleware sources so they can be tested
// in isolation without spinning up Express or Prisma.
// ---------------------------------------------------------------------------

function simulateOwnershipCheck(ownerId: string, requestUserId: string): number {
  const execution = { workflow: { userId: ownerId } };
  if (!execution) return 404;
  if (execution.workflow.userId !== requestUserId) return 403;
  return 200;
}

function isPrivateIp(ip: string): boolean {
  // IPv6 loopback
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

async function assertPublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  const { hostname } = parsed;
  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new Error(`Could not resolve hostname: ${hostname}`);
  }
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error("Requests to private/loopback addresses are not allowed");
    }
  }
}

// ---------------------------------------------------------------------------
// A. Execution ownership check
// ---------------------------------------------------------------------------

test("ownership: different user gets 403", () => {
  assert.equal(simulateOwnershipCheck("alice", "bob"), 403);
});

test("ownership: owner gets 200", () => {
  assert.equal(simulateOwnershipCheck("alice", "alice"), 200);
});

test("ownership: empty userId gets 403", () => {
  assert.equal(simulateOwnershipCheck("alice", ""), 403);
});

// ---------------------------------------------------------------------------
// B. SSRF guard — private/loopback addresses rejected
// ---------------------------------------------------------------------------

test("SSRF: blocks 127.0.0.1", async () => {
  await assert.rejects(() => assertPublicUrl("http://127.0.0.1/secret"), /private|loopback|not allowed/i);
});

test("SSRF: blocks 127.0.0.1 with port", async () => {
  await assert.rejects(() => assertPublicUrl("http://127.0.0.1:8080/api"), /private|loopback|not allowed/i);
});

test("SSRF: blocks 10.x.x.x", async () => {
  await assert.rejects(() => assertPublicUrl("http://10.0.0.1/internal"), /private|loopback|not allowed/i);
});

test("SSRF: blocks 192.168.x.x", async () => {
  await assert.rejects(() => assertPublicUrl("http://192.168.1.1/admin"), /private|loopback|not allowed/i);
});

test("SSRF: blocks link-local 169.254.x.x (AWS IMDS)", async () => {
  await assert.rejects(() => assertPublicUrl("http://169.254.169.254/latest/meta-data/"), /private|loopback|not allowed/i);
});

// ---------------------------------------------------------------------------
// C. isPrivateIp boundary and edge cases
// ---------------------------------------------------------------------------

test("isPrivateIp: 10.0.0.0 is private", () => {
  assert.equal(isPrivateIp("10.0.0.0"), true);
});

test("isPrivateIp: 10.255.255.255 is private", () => {
  assert.equal(isPrivateIp("10.255.255.255"), true);
});

test("isPrivateIp: 172.15.0.1 is public (below 172.16)", () => {
  assert.equal(isPrivateIp("172.15.0.1"), false);
});

test("isPrivateIp: 172.16.0.1 is private (lower bound)", () => {
  assert.equal(isPrivateIp("172.16.0.1"), true);
});

test("isPrivateIp: 172.31.255.255 is private (upper bound)", () => {
  assert.equal(isPrivateIp("172.31.255.255"), true);
});

test("isPrivateIp: 172.32.0.1 is public (above 172.31)", () => {
  assert.equal(isPrivateIp("172.32.0.1"), false);
});

test("isPrivateIp: 192.167.0.1 is public", () => {
  assert.equal(isPrivateIp("192.167.0.1"), false);
});

test("isPrivateIp: 192.169.0.1 is public", () => {
  assert.equal(isPrivateIp("192.169.0.1"), false);
});

test("isPrivateIp: 169.254.0.1 is private link-local", () => {
  assert.equal(isPrivateIp("169.254.0.1"), true);
});

test("isPrivateIp: IPv6 loopback ::1 is private", () => {
  assert.equal(isPrivateIp("::1"), true);
});

test("isPrivateIp: public IPv4 8.8.8.8 is not private", () => {
  assert.equal(isPrivateIp("8.8.8.8"), false);
});

test("isPrivateIp: non-IP string returns false", () => {
  assert.equal(isPrivateIp("not-an-ip"), false);
});

// ---------------------------------------------------------------------------
// D. Auth header parsing
// ---------------------------------------------------------------------------

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7) || null;
}

test("auth: valid Bearer header extracts token", () => {
  assert.equal(extractBearerToken("Bearer mytoken123"), "mytoken123");
});

test("auth: missing header returns null", () => {
  assert.equal(extractBearerToken(undefined), null);
});

test("auth: wrong prefix returns null", () => {
  assert.equal(extractBearerToken("Token mytoken123"), null);
});

test("auth: Basic auth returns null", () => {
  assert.equal(extractBearerToken("Basic dXNlcjpwYXNz"), null);
});

test("auth: Bearer with empty token returns null", () => {
  assert.equal(extractBearerToken("Bearer "), null);
});
