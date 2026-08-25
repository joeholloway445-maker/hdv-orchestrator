import https from "https";
import http from "http";

interface NodeDef {
  data: Record<string, unknown>;
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("RSS fetch timeout")); });
  });
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
}

function parseItem(xml: string): Record<string, unknown> {
  return {
    title: extractTag(xml, "title"),
    link: extractTag(xml, "link"),
    description: extractTag(xml, "description"),
    pubDate: extractTag(xml, "pubDate") || extractTag(xml, "updated") || extractTag(xml, "dc:date"),
    author: extractTag(xml, "author") || extractTag(xml, "dc:creator"),
    guid: extractTag(xml, "guid") || extractTag(xml, "id"),
    category: extractTag(xml, "category"),
  };
}

function parseRss(xml: string): { channel: Record<string, unknown>; items: Record<string, unknown>[] } {
  const itemTag = xml.includes("<entry") ? "entry" : "item";
  const itemRe = new RegExp(`<${itemTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${itemTag}>`, "gi");
  const items: Record<string, unknown>[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) items.push(parseItem(m[1]));

  const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
  const channelXml = channelMatch?.[1] ?? xml;
  const channel: Record<string, unknown> = {
    title: extractTag(channelXml, "title"),
    link: extractTag(channelXml, "link"),
    description: extractTag(channelXml, "description"),
    language: extractTag(channelXml, "language"),
    lastBuildDate: extractTag(channelXml, "lastBuildDate") || extractTag(channelXml, "updated"),
  };

  return { channel, items };
}

export async function executeRss(node: NodeDef, $input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = String(node.data?.url || $input.url || "");
  const outputField = String(node.data?.outputField || "items");
  const limit = Number(node.data?.limit) || 0;
  const includeChannel = node.data?.includeChannel !== false;

  if (!url) throw new Error("RSS node: url is required");

  const xml = await fetchUrl(url);
  const { channel, items } = parseRss(xml);
  const limited = limit > 0 ? items.slice(0, limit) : items;

  const out: Record<string, unknown> = { ...$input, [outputField]: limited };
  if (includeChannel) out.channel = channel;
  return out;
}
