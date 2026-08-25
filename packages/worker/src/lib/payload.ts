/**
 * Payload spillover — keeps large intermediate node outputs off the heap,
 * Redis Pub/Sub, and Postgres columns.
 *
 * Payloads under SPILL_THRESHOLD_BYTES pass through unchanged.
 * Payloads at or above the threshold are written to disk under
 * PAYLOAD_SPILL_DIR/{executionId}/{nodeId}.json and replaced in memory
 * with a SpillRef stub. The stub is resolved back to the full payload
 * whenever the next node needs $input. Files are cleaned up via
 * cleanupPayloads() when the execution finishes.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const SPILL_THRESHOLD = Number(process.env.PAYLOAD_SPILL_THRESHOLD_BYTES) || 256 * 1024;
const SPILL_DIR = process.env.PAYLOAD_SPILL_DIR || path.join(os.tmpdir(), "hdv-payloads");

const MARKER = "__spilled__" as const;

export interface SpillRef {
  [MARKER]: true;
  path: string;
  sizeBytes: number;
}

export function isSpillRef(v: unknown): v is SpillRef {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Record<string, unknown>)[MARKER] === true
  );
}

/**
 * Store a node output. Returns the original value if small enough, or a
 * SpillRef if it had to be spilled to disk.
 */
export async function storePayload(
  executionId: string,
  nodeId: string,
  payload: unknown,
): Promise<unknown> {
  const json = JSON.stringify(payload);
  const byteLen = Buffer.byteLength(json, "utf-8");
  if (byteLen < SPILL_THRESHOLD) return payload;

  const dir = path.join(SPILL_DIR, executionId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${nodeId}.json`);
  await fs.writeFile(filePath, json, "utf-8");

  const ref: SpillRef = { [MARKER]: true, path: filePath, sizeBytes: byteLen };
  return ref;
}

/**
 * Resolve a value that may be a SpillRef back to its original payload.
 * Returns the value unchanged if it is not a SpillRef.
 */
export async function resolvePayload(v: unknown): Promise<unknown> {
  if (!isSpillRef(v)) return v;
  const json = await fs.readFile(v.path, "utf-8");
  return JSON.parse(json) as unknown;
}

/**
 * Delete all spilled files for an execution. Call this after the execution
 * reaches a terminal state (SUCCESS or FAILED).
 */
export async function cleanupPayloads(executionId: string): Promise<void> {
  const dir = path.join(SPILL_DIR, executionId);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Return a safe summary for logging to Postgres or Redis.
 * SpillRefs become a stub; inline payloads above the threshold are truncated
 * to avoid writing multi-megabyte JSON into DB columns or Pub/Sub messages.
 */
export function payloadSummary(v: unknown): unknown {
  if (isSpillRef(v)) {
    return { _spilled: true, sizeBytes: v.sizeBytes };
  }
  const json = JSON.stringify(v);
  const byteLen = Buffer.byteLength(json, "utf-8");
  if (byteLen >= SPILL_THRESHOLD) {
    return {
      _truncated: true,
      sizeBytes: byteLen,
      preview: json.slice(0, 512),
    };
  }
  return v;
}
