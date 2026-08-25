import ivm from "isolated-vm";

const MEMORY_LIMIT_MB = Number(process.env.CODE_MEMORY_LIMIT_MB) || 128;
const CPU_TIMEOUT_MS  = Number(process.env.CODE_CPU_TIMEOUT_MS)  || 5_000;

interface NodeDef {
  data: Record<string, unknown>;
}

export async function executeCode(node: NodeDef, $input: unknown): Promise<unknown> {
  const code = String(node.data?.code || "").trim();
  if (!code) return $input;

  // One isolate per execution — disposed in `finally` regardless of outcome.
  // Memory limit is enforced by the V8 heap inspector; violations throw in the
  // host context and do not crash the worker process.
  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB });

  try {
    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set("global", jail.derefInto());

    // Expose both `$input` (raw object) and `items` (n8n-style array) so user
    // code can use either API style: `return { ...items[0].json, x: 1 }`.
    await jail.set("$input", new ivm.ExternalCopy($input).copyInto());
    await jail.set("items", new ivm.ExternalCopy([{ json: $input }]).copyInto());

    // timeout is a hard CPU-time limit enforced by V8's isolate watchdog thread.
    // An infinite loop (`while(true){}`) cannot bypass it.
    const script = await isolate.compileScript(`(function() { ${code} })()`);
    const result = await script.run(context, { timeout: CPU_TIMEOUT_MS, copy: true });
    return result ?? $input;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    // Distinguish timeout / OOM / code error for clearer operator messages.
    const lower = msg.toLowerCase();
    if (lower.includes("timed out") || lower.includes("timeout") || (err as { killed?: boolean }).killed) {
      throw new Error(
        `Code node exceeded CPU time limit (${CPU_TIMEOUT_MS}ms) — check for infinite loops`,
      );
    }
    if (lower.includes("memory limit") || lower.includes("heap out of memory") || lower.includes("allocation failed")) {
      throw new Error(
        `Code node exceeded memory limit (${MEMORY_LIMIT_MB}MB)`,
      );
    }
    throw new Error(`Code node error: ${msg}`);
  } finally {
    // Always dispose — even on timeout — to release the V8 isolate's heap.
    if (!isolate.isDisposed) isolate.dispose();
  }
}
