interface NodeDef {
  data: Record<string, unknown>;
}

export class WaitSignal extends Error {
  constructor(public readonly delayMs: number) {
    super(`wait:${delayMs}`);
    this.name = "WaitSignal";
  }
}

export function executeWait(node: NodeDef, _$input: Record<string, unknown>): never {
  const ms = Math.min(parseInt(String(node.data?.duration || "1000"), 10), 300_000);
  throw new WaitSignal(ms);
}
