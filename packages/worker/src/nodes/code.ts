import ivm from "isolated-vm";

interface NodeDef {
  data: Record<string, unknown>;
}

export async function executeCode(node: NodeDef, $input: unknown): Promise<unknown> {
  const code = String(node.data?.code || "").trim();
  if (!code) return $input;

  const isolate = new ivm.Isolate({ memoryLimit: 64 });
  try {
    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set("global", jail.derefInto());
    await jail.set("$input", new ivm.ExternalCopy($input).copyInto());

    const script = await isolate.compileScript(`(function() { ${code} })()`);
    const result = await script.run(context, { timeout: 5000, copy: true });
    return result ?? $input;
  } finally {
    isolate.dispose();
  }
}
