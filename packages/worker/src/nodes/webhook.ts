export async function executeWebhookTrigger(
  _node: unknown,
  $input: Record<string, unknown>
): Promise<unknown> {
  // Passes trigger payload downstream unchanged
  return $input;
}
