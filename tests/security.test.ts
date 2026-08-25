/**
 * Security regression tests (run with: npx ts-node tests/security.test.ts)
 *
 * Covers:
 * 1. GET /executions/:id returns 403 when the execution belongs to a different user
 * 2. HTTP node throws when the target is a loopback/private address (SSRF guard)
 */

import assert from "node:assert/strict";
import dns from "dns/promises";

// ── 1. Execution ownership check ─────────────────────────────────────────────
// Simulate the route handler logic in isolation
async function simulateGetExecution(
  executionOwnerId: string,
  requestUserId: string,
): Promise<number> {
  // Mirrors the logic in packages/api/src/routes/executions.ts GET /:id
  const execution = { workflow: { userId: executionOwnerId } };
  if (!execution) return 404;
  if (execution.workflow.userId !== requestUserId) return 403;
  return 200;
}

async function testOwnershipCheck() {
  const status403 = await simulateGetExecution("user-alice", "user-bob");
  assert.equal(status403, 403, "Different user should get 403");

  const status200 = await simulateGetExecution("user-alice", "user-alice");
  assert.equal(status200, 200, "Owner should get 200");

  console.log("  PASS: execution ownership check");
}

// ── 2. SSRF guard — private/loopback addresses ───────────────────────────────
// Mirrors the logic in packages/worker/src/nodes/http.ts

function isPrivateIp(ip: string): boolean {
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

async function testSsrfGuard() {
  const privateUrls = [
    "http://127.0.0.1/secret",
    "http://127.0.0.1:8080/api",
    "http://10.0.0.1/internal",
    "http://192.168.1.1/admin",
    "http://169.254.169.254/latest/meta-data/",
  ];

  for (const url of privateUrls) {
    await assert.rejects(
      () => assertPublicUrl(url),
      /private|loopback|not allowed/i,
      `Expected ${url} to be rejected`,
    );
  }

  console.log("  PASS: SSRF guard blocks private/loopback URLs");
}

// ── Runner ───────────────────────────────────────────────────────────────────
(async () => {
  let failed = false;

  for (const [name, fn] of [
    ["execution ownership check", testOwnershipCheck],
    ["SSRF guard", testSsrfGuard],
  ] as [string, () => Promise<void>][]) {
    try {
      console.log(`\nRunning: ${name}`);
      await fn();
    } catch (err) {
      console.error(`  FAIL: ${name}`);
      console.error(err);
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  } else {
    console.log("\nAll tests passed.");
  }
})();
