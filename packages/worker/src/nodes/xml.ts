interface NodeDef {
  data: Record<string, unknown>;
}

function attrStr(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join("");
}

function toXml(val: unknown, tag = "item", indent = 0): string {
  const pad = "  ".repeat(indent);
  if (val === null || val === undefined) return `${pad}<${tag}/>`;
  if (typeof val !== "object") {
    const escaped = String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `${pad}<${tag}>${escaped}</${tag}>`;
  }
  if (Array.isArray(val)) {
    return val.map((v) => toXml(v, tag, indent)).join("\n");
  }
  const children = Object.entries(val as Record<string, unknown>)
    .map(([k, v]) => toXml(v, k, indent + 1))
    .join("\n");
  return `${pad}<${tag}>\n${children}\n${pad}</${tag}>`;
}

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlNode[];
}

function parseXml(xml: string): Record<string, unknown> {
  const stack: XmlNode[] = [{ tag: "__root__", attrs: {}, text: "", children: [] }];

  const re = /<(\/?)([A-Za-z_][\w.-]*)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    const [, closing, tag, rawAttrs, text] = m;
    if (text) {
      const trimmed = text.replace(/\s+/g, " ").trim();
      if (trimmed) stack[stack.length - 1].text += trimmed;
    } else if (closing) {
      if (stack.length > 1) {
        const finished = stack.pop()!;
        const parent = stack[stack.length - 1];
        parent.children.push(finished);
      }
    } else {
      const attrs: Record<string, string> = {};
      const attrRe = /(\w[\w.-]*)=["']([^"']*)["']/g;
      let am: RegExpExecArray | null;
      while ((am = attrRe.exec(rawAttrs)) !== null) attrs[am[1]] = am[2];
      const selfClose = rawAttrs.trimEnd().endsWith("/");
      const node: XmlNode = { tag, attrs, text: "", children: [] };
      if (selfClose) {
        stack[stack.length - 1].children.push(node);
      } else {
        stack.push(node);
      }
    }
  }

  function nodeToObj(n: XmlNode): unknown {
    if (n.children.length === 0) {
      const base = n.text || null;
      if (Object.keys(n.attrs).length === 0) return base;
      return { _text: base, ...n.attrs };
    }
    const obj: Record<string, unknown> = { ...n.attrs };
    if (n.text) obj._text = n.text;
    for (const child of n.children) {
      const key = child.tag;
      const val = nodeToObj(child);
      if (key in obj) {
        const existing = obj[key];
        obj[key] = Array.isArray(existing) ? [...existing, val] : [existing, val];
      } else {
        obj[key] = val;
      }
    }
    return obj;
  }

  const root = stack[0];
  if (root.children.length === 1) {
    const top = root.children[0];
    return { [top.tag]: nodeToObj(top) };
  }
  const out: Record<string, unknown> = {};
  for (const c of root.children) {
    out[c.tag] = nodeToObj(c);
  }
  return out;
}

export function executeXml(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const operation = String(node.data?.operation || "parse");
  const inputField = String(node.data?.inputField || "body");
  const outputField = String(node.data?.outputField || "data");
  const rootTag = String(node.data?.rootTag || "root");
  const itemTag = String(node.data?.itemTag || "item");

  switch (operation) {
    case "parse": {
      const xmlStr = String($input[inputField] || "");
      const parsed = parseXml(xmlStr);
      return { ...$input, [outputField]: parsed };
    }
    case "stringify": {
      const value = $input[inputField] ?? $input;
      const xmlOut = `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(value, rootTag)}`;
      return { ...$input, [outputField]: xmlOut };
    }
    case "toArray": {
      const xmlStr = String($input[inputField] || "");
      const parsed = parseXml(xmlStr);
      const firstKey = Object.keys(parsed)[0];
      const top = firstKey ? (parsed[firstKey] as Record<string, unknown>) : {};
      const items = top?.[itemTag];
      const arr = Array.isArray(items) ? items : items !== undefined ? [items] : [];
      return { ...$input, [outputField]: arr };
    }
    default:
      return $input;
  }
}
