/**
 * tests/webhook_auth.test.ts — Webhook authentication logic tests (node:test).
 *
 * Covers the four authType modes in packages/api/src/routes/webhooks.ts:
 *  A. apikey — header match
 *  B. basic — base64 decoded user:pass match
 *  C. bearer — token match
 *  D. hmac — HMAC-SHA256 with timingSafeEqual
 *
 * Run: node --require ts-node/register --test tests/webhook_auth.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Pure implementations mirrored from webhooks.ts for isolation testing
// ---------------------------------------------------------------------------

type AuthResult = "ok" | "unauthorized";

interface WebhookTriggerData {
  authType?: string;
  authValue?: string;
  authHeaderName?: string;
}

function checkApikeyAuth(
  headers: Record<string, string>,
  query: Record<string, string>,
  data: WebhookTriggerData
): AuthResult {
  const headerName = data.authHeaderName || "X-API-Key";
  const expected = data.authValue;
  const provided = headers[headerName.toLowerCase()] ?? query["apiKey"];
  if (!expected || provided !== expected) return "unauthorized";
  return "ok";
}

function checkBasicAuth(headers: Record<string, string>, data: WebhookTriggerData): AuthResult {
  const authHeader = headers["authorization"] || "";
  const b64 = authHeader.replace(/^Basic\s+/i, "");
  const decoded = Buffer.from(b64, "base64").toString("utf8");
  const expected = data.authValue;
  if (!expected || decoded !== expected) return "unauthorized";
  return "ok";
}

function checkBearerAuth(headers: Record<string, string>, data: WebhookTriggerData): AuthResult {
  const authHeader = headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const expected = data.authValue;
  if (!expected || token !== expected) return "unauthorized";
  return "ok";
}

function checkHmacAuth(
  headers: Record<string, string>,
  body: unknown,
  data: WebhookTriggerData
): AuthResult {
  const secret = data.authValue;
  const headerName = data.authHeaderName || "x-hub-signature-256";
  const provided = String(headers[headerName.toLowerCase()] || "").replace(/^sha256=/i, "");
  if (!secret || !provided) return "unauthorized";
  const rawBody = JSON.stringify(body);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  let match = false;
  try {
    match = timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    match = false;
  }
  return match ? "ok" : "unauthorized";
}

// ---------------------------------------------------------------------------
// A. apikey
// ---------------------------------------------------------------------------

test("apikey: correct value in default header passes", () => {
  assert.equal(
    checkApikeyAuth({ "x-api-key": "secret123" }, {}, { authType: "apikey", authValue: "secret123" }),
    "ok"
  );
});

test("apikey: wrong value in header is rejected", () => {
  assert.equal(
    checkApikeyAuth({ "x-api-key": "wrong" }, {}, { authType: "apikey", authValue: "secret123" }),
    "unauthorized"
  );
});

test("apikey: missing header is rejected", () => {
  assert.equal(
    checkApikeyAuth({}, {}, { authType: "apikey", authValue: "secret123" }),
    "unauthorized"
  );
});

test("apikey: correct value in query param passes", () => {
  assert.equal(
    checkApikeyAuth({}, { apiKey: "secret123" }, { authType: "apikey", authValue: "secret123" }),
    "ok"
  );
});

test("apikey: custom header name is respected", () => {
  assert.equal(
    checkApikeyAuth(
      { "x-my-token": "abc" },
      {},
      { authType: "apikey", authValue: "abc", authHeaderName: "X-My-Token" }
    ),
    "ok"
  );
});

test("apikey: no authValue configured is always rejected", () => {
  assert.equal(
    checkApikeyAuth({ "x-api-key": "anything" }, {}, { authType: "apikey", authValue: undefined }),
    "unauthorized"
  );
});

// ---------------------------------------------------------------------------
// B. basic
// ---------------------------------------------------------------------------

test("basic: correct base64 user:pass passes", () => {
  const creds = Buffer.from("admin:hunter2").toString("base64");
  assert.equal(
    checkBasicAuth(
      { authorization: `Basic ${creds}` },
      { authType: "basic", authValue: "admin:hunter2" }
    ),
    "ok"
  );
});

test("basic: wrong password is rejected", () => {
  const creds = Buffer.from("admin:wrong").toString("base64");
  assert.equal(
    checkBasicAuth(
      { authorization: `Basic ${creds}` },
      { authType: "basic", authValue: "admin:hunter2" }
    ),
    "unauthorized"
  );
});

test("basic: missing Authorization header is rejected", () => {
  assert.equal(
    checkBasicAuth({}, { authType: "basic", authValue: "admin:hunter2" }),
    "unauthorized"
  );
});

// ---------------------------------------------------------------------------
// C. bearer
// ---------------------------------------------------------------------------

test("bearer: correct token passes", () => {
  assert.equal(
    checkBearerAuth(
      { authorization: "Bearer mytoken" },
      { authType: "bearer", authValue: "mytoken" }
    ),
    "ok"
  );
});

test("bearer: wrong token is rejected", () => {
  assert.equal(
    checkBearerAuth(
      { authorization: "Bearer wrongtoken" },
      { authType: "bearer", authValue: "mytoken" }
    ),
    "unauthorized"
  );
});

test("bearer: missing Authorization is rejected", () => {
  assert.equal(
    checkBearerAuth({}, { authType: "bearer", authValue: "mytoken" }),
    "unauthorized"
  );
});

test("bearer: Bearer prefix is stripped case-insensitively", () => {
  assert.equal(
    checkBearerAuth(
      { authorization: "BEARER mytoken" },
      { authType: "bearer", authValue: "mytoken" }
    ),
    "ok"
  );
});

// ---------------------------------------------------------------------------
// D. hmac
// ---------------------------------------------------------------------------

function makeHmacSig(secret: string, body: unknown): string {
  return createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
}

test("hmac: valid signature passes", () => {
  const body = { event: "push", ref: "main" };
  const sig = makeHmacSig("supersecret", body);
  assert.equal(
    checkHmacAuth(
      { "x-hub-signature-256": sig },
      body,
      { authType: "hmac", authValue: "supersecret" }
    ),
    "ok"
  );
});

test("hmac: sha256= prefix is stripped", () => {
  const body = { foo: "bar" };
  const sig = `sha256=${makeHmacSig("mysecret", body)}`;
  assert.equal(
    checkHmacAuth(
      { "x-hub-signature-256": sig },
      body,
      { authType: "hmac", authValue: "mysecret" }
    ),
    "ok"
  );
});

test("hmac: wrong secret is rejected", () => {
  const body = { foo: "bar" };
  const sig = makeHmacSig("correct", body);
  assert.equal(
    checkHmacAuth(
      { "x-hub-signature-256": sig },
      body,
      { authType: "hmac", authValue: "wrong" }
    ),
    "unauthorized"
  );
});

test("hmac: tampered body is rejected", () => {
  const body = { foo: "bar" };
  const sig = makeHmacSig("secret", body);
  assert.equal(
    checkHmacAuth(
      { "x-hub-signature-256": sig },
      { foo: "tampered" },
      { authType: "hmac", authValue: "secret" }
    ),
    "unauthorized"
  );
});

test("hmac: missing signature header is rejected", () => {
  const body = { foo: "bar" };
  assert.equal(
    checkHmacAuth({}, body, { authType: "hmac", authValue: "secret" }),
    "unauthorized"
  );
});

test("hmac: missing secret configuration is rejected", () => {
  const body = { foo: "bar" };
  const sig = makeHmacSig("secret", body);
  assert.equal(
    checkHmacAuth(
      { "x-hub-signature-256": sig },
      body,
      { authType: "hmac", authValue: undefined }
    ),
    "unauthorized"
  );
});

test("hmac: custom header name is respected", () => {
  const body = { x: 1 };
  const sig = makeHmacSig("sec", body);
  assert.equal(
    checkHmacAuth(
      { "x-custom-sig": sig },
      body,
      { authType: "hmac", authValue: "sec", authHeaderName: "x-custom-sig" }
    ),
    "ok"
  );
});

test("hmac: malformed hex signature does not crash", () => {
  assert.equal(
    checkHmacAuth(
      { "x-hub-signature-256": "not-valid-hex!!!" },
      { foo: "bar" },
      { authType: "hmac", authValue: "secret" }
    ),
    "unauthorized"
  );
});
