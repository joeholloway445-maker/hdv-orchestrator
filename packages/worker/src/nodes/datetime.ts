import { interpolate as _interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  const r = _interpolate(template, data as Record<string, unknown>);
  return r !== undefined && r !== null ? String(r) : "";
}

const MS: Record<string, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};

function parseInput(s: string): Date {
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error(`Invalid date value: "${s}"`);
  return d;
}

function formatOutput(d: Date, fmt: string): string | number {
  switch (fmt) {
    case "unix": return Math.floor(d.getTime() / 1000);
    case "unix_ms": return d.getTime();
    case "date": return d.toISOString().split("T")[0];
    case "time": return d.toTimeString().split(" ")[0];
    case "local": return d.toLocaleString();
    case "iso":
    default:
      return d.toISOString();
  }
}

export function executeDatetime(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const operation = String(node.data?.operation || "now");
  const outputField = String(node.data?.outputField || "datetime");
  const format = String(node.data?.format || "iso");
  const unit = String(node.data?.unit || "days");
  const amount = Number(node.data?.amount ?? 1);

  const rawInput = node.data?.inputField ? interpolate(String(node.data.inputField), $input) : "";
  const rawCompare = node.data?.compareField ? interpolate(String(node.data.compareField), $input) : "";

  let result: unknown;

  switch (operation) {
    case "now":
      result = formatOutput(new Date(), format);
      break;

    case "format":
      result = formatOutput(parseInput(rawInput), format);
      break;

    case "add":
      result = formatOutput(new Date(parseInput(rawInput).getTime() + amount * (MS[unit] ?? MS.days)), format);
      break;

    case "subtract":
      result = formatOutput(new Date(parseInput(rawInput).getTime() - amount * (MS[unit] ?? MS.days)), format);
      break;

    case "diff": {
      const ms = MS[unit] ?? MS.days;
      result = (parseInput(rawCompare).getTime() - parseInput(rawInput).getTime()) / ms;
      break;
    }

    case "startOf": {
      const d = parseInput(rawInput);
      if (unit === "day" || unit === "days") d.setUTCHours(0, 0, 0, 0);
      else if (unit === "month") { d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); }
      else if (unit === "year") { d.setUTCMonth(0, 1); d.setUTCHours(0, 0, 0, 0); }
      result = formatOutput(d, format);
      break;
    }

    case "endOf": {
      const d = parseInput(rawInput);
      if (unit === "day" || unit === "days") d.setUTCHours(23, 59, 59, 999);
      else if (unit === "month") { d.setUTCMonth(d.getUTCMonth() + 1, 0); d.setUTCHours(23, 59, 59, 999); }
      else if (unit === "year") { d.setUTCMonth(11, 31); d.setUTCHours(23, 59, 59, 999); }
      result = formatOutput(d, format);
      break;
    }

    case "isAfter":
      result = parseInput(rawInput).getTime() > parseInput(rawCompare).getTime();
      break;

    case "isBefore":
      result = parseInput(rawInput).getTime() < parseInput(rawCompare).getTime();
      break;

    default:
      result = formatOutput(new Date(), format);
  }

  return { ...$input, [outputField]: result };
}
