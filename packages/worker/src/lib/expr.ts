/**
 * Expression evaluator supporting:
 *   {{ $json.field }}         — alias for $input.field
 *   {{ $input.field.sub }}    — dot-path access
 *   {{ $vars.KEY }}           — global variables
 *   {{ $now }}                — current ISO timestamp
 *   {{ $timestamp }}          — unix ms
 *   {{ someKey }}             — top-level field shorthand
 */

function dotGet(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc: unknown, k) => {
    if (acc === null || acc === undefined) return undefined;
    if (typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

function resolveToken(token: string, $input: Record<string, unknown>): unknown {
  const t = token.trim();
  if (t === "$now") return new Date().toISOString();
  if (t === "$timestamp") return Date.now();
  if (t.startsWith("$json.")) return dotGet($input, t.slice(6));
  if (t.startsWith("$input.")) return dotGet($input, t.slice(7));
  if (t.startsWith("$vars.")) return dotGet($input.$vars ?? {}, t.slice(6));
  // shorthand — top-level field
  return dotGet($input, t);
}

export function interpolate(template: string, $input: Record<string, unknown>): unknown {
  if (typeof template !== "string") return template;

  // If the entire template is a single expression, return the typed value
  const single = template.match(/^\{\{(.+?)\}\}$/);
  if (single) return resolveToken(single[1], $input);

  // Otherwise string-replace all expressions
  return template.replace(/\{\{(.+?)\}\}/g, (_, expr: string) => {
    const val = resolveToken(expr, $input);
    return val !== undefined && val !== null ? String(val) : "";
  });
}
