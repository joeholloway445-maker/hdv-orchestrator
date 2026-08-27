import { createHmac } from 'node:crypto';

export async function deliverWebhook(
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
