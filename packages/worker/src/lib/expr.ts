/**
 * Expression evaluator supporting:
 *   {{ $json.field }}               — alias for $input.field
 *   {{ $input.field.sub }}          — dot-path access
 *   {{ $input.items[0].name }}      — array index access (negative indices supported)
 *   {{ $vars.KEY }}                 — global variables
 *   {{ $env.VAR_NAME }}             — environment variable
 *   {{ $now }}                      — current ISO timestamp
 *   {{ $timestamp }}                — unix ms
 *   {{ $execution.id }}             — current execution ID
 *   {{ $workflow.name }}            — current workflow name
 *   {{ $node.NodeName.json.field }} — output of a named upstream node
 *   {{ someKey }}                   — top-level field shorthand
 */

// Normalise a bracket-notation path segment: "items[0]" → ["items", 0]
function expandSegment(segment: string): Array<string | number> {
  const results: Array<string | number> = [];
  // Match bracket indices within the segment: e.g. "items[0][-1]"
  const bracketRe = /([^\[]*)\[(-?\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = bracketRe.exec(segment)) !== null) {
    if (match[1]) results.push(match[1]);
    results.push(parseInt(match[2], 10));
    lastIndex = bracketRe.lastIndex;
  }
  const tail = segment.slice(lastIndex);
  if (tail) results.push(tail);
  return results.length ? results : [segment];
}

function dotGet(obj: unknown, path: string): unknown {
  const rawSegments = path.split(".");
  const segments: Array<string | number> = rawSegments.flatMap(expandSegment);
  return segments.reduce((acc: unknown, k) => {
    if (acc === null || acc === undefined) return undefined;
    if (typeof k === "number") {
      if (!Array.isArray(acc)) return undefined;
      const idx = k < 0 ? acc.length + k : k;
      return acc[idx];
    }
    if (typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

function resolveToken(
  token: string,
  $input: Record<string, unknown>,
  nodeOutputs?: Record<string, unknown>,
): unknown {
  const t = token.trim();
  if (t === "$now") return new Date().toISOString();
  if (t === "$timestamp") return Date.now();
  if (t.startsWith("$json.")) return dotGet($input, t.slice(6));
  if (t.startsWith("$input.")) return dotGet($input, t.slice(7));
  if (t.startsWith("$vars.")) return dotGet($input.$vars ?? {}, t.slice(6));
  if (t.startsWith("$env.")) return process.env[t.slice(5)];
  if (t === "$execution") return $input.$execution;
  if (t.startsWith("$execution.")) return dotGet($input.$execution ?? {}, t.slice(11));
  if (t === "$workflow") return $input.$workflow;
  if (t.startsWith("$workflow.")) return dotGet($input.$workflow ?? {}, t.slice(10));
  // Also support nodeOutputs injected through $input.$nodeOutputs
  const resolvedNodeOutputs = nodeOutputs ?? ($input.$nodeOutputs as Record<string, unknown> | undefined);
  if (t.startsWith("$node.") && resolvedNodeOutputs) {
    // $node.NodeName.json.rest or $node.NodeName.output.rest
    const rest = t.slice(6); // "NodeName.json.field" or "NodeName.field"
    const dotIdx = rest.indexOf(".");
    if (dotIdx === -1) return resolvedNodeOutputs[rest];
    const nodeName = rest.slice(0, dotIdx);
    const fieldPath = rest.slice(dotIdx + 1);
    const nodeOut = resolvedNodeOutputs[nodeName];
    // Support .json.field as alias for direct field access (n8n compat)
    if (fieldPath.startsWith("json.")) return dotGet(nodeOut, fieldPath.slice(5));
    if (fieldPath === "json") return nodeOut;
    return dotGet(nodeOut, fieldPath);
  }
  // shorthand — top-level field
  return dotGet($input, t);
}

export function interpolate(
  template: string,
  $input: Record<string, unknown>,
  nodeOutputs?: Record<string, unknown>,
): unknown {
  if (typeof template !== "string") return template;

  // If the entire template is a single expression, return the typed value
  const single = template.match(/^\{\{(.+?)\}\}$/);
  if (single) return resolveToken(single[1], $input, nodeOutputs);

  // Otherwise string-replace all expressions
  return template.replace(/\{\{(.+?)\}\}/g, (_, expr: string) => {
    const val = resolveToken(expr, $input, nodeOutputs);
    return val !== undefined && val !== null ? String(val) : "";
  });
}
