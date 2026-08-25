interface NodeDef {
  data: Record<string, unknown>;
}

function splitCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === delimiter) { result.push(current); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text: string, delimiter: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0], delimiter);
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const values = splitCSVLine(line, delimiter);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
    return obj;
  });
}

function escapeField(value: unknown, delimiter: string): string {
  const s = String(value ?? "");
  if (s.includes(delimiter) || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function stringifyCSV(rows: Record<string, unknown>[], delimiter: string): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(delimiter),
    ...rows.map((row) => headers.map((h) => escapeField(row[h], delimiter)).join(delimiter)),
  ];
  return lines.join("\n");
}

export function executeCSV(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const operation = String(node.data?.operation || "parse");
  const delimiter = String(node.data?.delimiter || ",");
  const inputField = String(node.data?.inputField || "csv");
  const outputField = String(node.data?.outputField || "rows");

  if (operation === "parse") {
    const raw = String($input[inputField] || "");
    const rows = parseCSV(raw, delimiter);
    return { ...$input, [outputField]: rows, count: rows.length };
  } else {
    const rows = ($input[inputField] as Record<string, unknown>[]) || [];
    const csv = stringifyCSV(rows, delimiter);
    return { ...$input, [outputField]: csv };
  }
}
