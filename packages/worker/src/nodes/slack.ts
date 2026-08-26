import { interpolate as _interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  const result = _interpolate(template, data as Record<string, unknown>);
  return result !== undefined && result !== null ? String(result) : "";
}

export async function executeSlack(node: NodeDef, $input: Record<string, unknown>): Promise<unknown> {
  const webhookUrl = interpolate(String(node.data?.webhookUrl || ""), $input);
  if (!webhookUrl) throw new Error("Slack node: webhookUrl is required");

  const text = interpolate(String(node.data?.text || ""), $input);
  const channel = node.data?.channel ? interpolate(String(node.data.channel), $input) : undefined;
  const username = node.data?.username ? interpolate(String(node.data.username), $input) : undefined;
  const iconEmoji = node.data?.iconEmoji ? String(node.data.iconEmoji) : undefined;
  const iconUrl = node.data?.iconUrl ? String(node.data.iconUrl) : undefined;

  const payload: Record<string, unknown> = { text };
  if (channel) payload.channel = channel;
  if (username) payload.username = username;
  if (iconEmoji) payload.icon_emoji = iconEmoji;
  if (iconUrl) payload.icon_url = iconUrl;

  // Support rich blocks if provided
  if (Array.isArray(node.data?.blocks)) {
    payload.blocks = node.data.blocks;
  }

  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Slack node: webhook request failed ${resp.status} — ${errText}`);
  }

  return { ...$input, slackSent: true, slackChannel: channel };
}
