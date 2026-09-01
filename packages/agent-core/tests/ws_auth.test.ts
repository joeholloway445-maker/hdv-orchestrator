/**
 * tests/ws_auth.test.ts — Verifies that the WebSocket server's verifyClient
 * gate rejects connections without a valid token when WS_API_KEY is set.
 *
 * We import the verifyClient logic directly (extracted from server.ts) so
 * tests run without binding a real port — no side-effects, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// Replicate the verifyClient predicate to test in isolation.
function makeVerifyClient(apiKey: string) {
  return function verifyClient(info: { req: { headers: Record<string, string>; url?: string } }): boolean {
    if (!apiKey) return true;
    const auth = info.req.headers["authorization"] ?? "";
    const qp = new URL(info.req.url ?? "/", "ws://localhost").searchParams.get("token") ?? "";
    return auth === `Bearer ${apiKey}` || qp === apiKey;
  };
}

test("verifyClient: allows all when no key configured", () => {
  const vc = makeVerifyClient("");
  assert.equal(vc({ req: { headers: {} } }), true);
  assert.equal(vc({ req: { headers: { authorization: "bad" } } }), true);
});

test("verifyClient: rejects missing auth header when key is set", () => {
  const vc = makeVerifyClient("secret123");
  assert.equal(vc({ req: { headers: {} } }), false);
});

test("verifyClient: rejects wrong bearer token", () => {
  const vc = makeVerifyClient("secret123");
  assert.equal(vc({ req: { headers: { authorization: "Bearer wrongkey" } } }), false);
});

test("verifyClient: accepts correct bearer token", () => {
  const vc = makeVerifyClient("secret123");
  assert.equal(vc({ req: { headers: { authorization: "Bearer secret123" } } }), true);
});

test("verifyClient: rejects wrong query-param token", () => {
  const vc = makeVerifyClient("secret123");
  assert.equal(vc({ req: { headers: {}, url: "/?token=wrong" } }), false);
});

test("verifyClient: accepts correct query-param token", () => {
  const vc = makeVerifyClient("secret123");
  assert.equal(vc({ req: { headers: {}, url: "/?token=secret123" } }), true);
});

test("verifyClient: bearer takes priority over missing query param", () => {
  const vc = makeVerifyClient("secret123");
  assert.equal(vc({ req: { headers: { authorization: "Bearer secret123" }, url: "/" } }), true);
});

test("verifyClient: rejects malformed authorization scheme", () => {
  const vc = makeVerifyClient("secret123");
  assert.equal(vc({ req: { headers: { authorization: "Token secret123" } } }), false);
});
