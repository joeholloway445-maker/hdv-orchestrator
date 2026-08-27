import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

async function deliverWebhook(
  url: string,
  secret: string,
  event: string,
  payload: object
): Promise<void> {
  const body = JSON.stringify({ event, ...payload, ts: Date.now() });
  const sig = createHmac('sha256', secret).update(body).digest('hex');

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HDV-Signature': `sha256=${sig}`,
      'X-HDV-Event': event,
    },
    body,
    signal: AbortSignal.timeout(10000),
  }).catch((err: Error) => {
    console.error(`[webhook] delivery failed to ${url}:`, err.message);
  });
}

export async function notifyWebhooks(
  prisma: PrismaClient,
  workflowId: string,
  tenantId: string,
  status: 'workflow.success' | 'workflow.failure',
  error?: string
): Promise<void> {
  let endpoints: Array<{ url: string; secret: string; events: string[] }>;
  try {
    endpoints = await prisma.webhookEndpoint.findMany({
      where: { userId: tenantId, active: true },
      select: { url: true, secret: true, events: true },
    });
  } catch (err) {
    console.error('[webhook] failed to fetch endpoints:', err);
    return;
  }

  const matching = endpoints.filter((ep) => ep.events.includes(status));
  if (matching.length === 0) return;

  const payload: Record<string, unknown> = { workflowId, tenantId };
  if (error !== undefined) payload.error = error;

  // Fire-and-forget in parallel — errors are caught inside deliverWebhook
  void Promise.all(
    matching.map((ep) => deliverWebhook(ep.url, ep.secret, status, payload))
  );
}
