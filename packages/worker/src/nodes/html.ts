interface NodeDef {
  data: Record<string, unknown>;
}

function extractText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractBySelector(html: string, selector: string): string[] {
  // Very basic CSS selector support: tag, .class, #id, tag[attr], tag[attr="val"]
  const results: string[] = [];

  // Attribute selector: input[name="foo"] or a[href]
  const attrMatch = selector.match(/^(\w+)?\[(\w+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (attrMatch) {
    const [, tag, attr, val] = attrMatch;
    const tagPattern = tag ? tag : "\\w+";
    const re = new RegExp(`<${tagPattern}[^>]*\\s${attr}\\s*=\\s*["']?([^"'\\s>]*)["']?[^>]*>([^<]*)`, "gi");
    let m;
    while ((m = re.exec(html)) !== null) {
      if (!val || m[1] === val) results.push(m[2].trim());
    }
    return results;
  }

  // Class selector: .className
  const classMatch = selector.match(/^\.(\S+)$/);
  if (classMatch) {
    const cls = classMatch[1].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    const re = new RegExp(`<\\w+[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\w+>`, "gi");
    let m;
    while ((m = re.exec(html)) !== null) results.push(extractText(m[1]));
    return results;
  }

  // ID selector: #myId
  const idMatch = selector.match(/^#(\S+)$/);
  if (idMatch) {
    const id = idMatch[1].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    const re = new RegExp(`<\\w+[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/\\w+>`, "gi");
    let m;
    while ((m = re.exec(html)) !== null) results.push(extractText(m[1]));
    return results;
  }

  // Tag selector: a, p, h1, etc.
  const tagMatch2 = selector.match(/^(\w+)$/);
  if (tagMatch2) {
    const tag = tagMatch2[1];
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
    let m;
    while ((m = re.exec(html)) !== null) results.push(extractText(m[1]));
    return results;
  }

  return results;
}

function extractLinks(html: string): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const re = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.push({ href: m[1], text: extractText(m[2]) });
  }
  return links;
}

function extractAttributes(html: string, tag: string, attr: string): string[] {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}\\s*=\\s*["']([^"']*)["'][^>]*>`, "gi");
  const results: string[] = [];
  let m;
  while ((m = re.exec(html)) !== null) results.push(m[1]);
  return results;
}

export function executeHtmlExtract(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const operation = String(node.data?.operation || "text");
  const inputField = String(node.data?.inputField || "body");
  const outputField = String(node.data?.outputField || "extracted");
  const selector = String(node.data?.selector || "");
  const tag = String(node.data?.tag || "a");
  const attr = String(node.data?.attr || "href");

  const html = String($input[inputField] || "");

  switch (operation) {
    case "text":
      return { ...$input, [outputField]: extractText(html) };
    case "select":
      return { ...$input, [outputField]: extractBySelector(html, selector) };
    case "links":
      return { ...$input, [outputField]: extractLinks(html) };
    case "attributes":
      return { ...$input, [outputField]: extractAttributes(html, tag, attr) };
    default:
      return { ...$input, [outputField]: extractText(html) };
  }
}
