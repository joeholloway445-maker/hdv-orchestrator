import { PrismaClient } from "@prisma/client";

interface NodeDef {
  data: Record<string, unknown>;
}

export async function executeMemoryRead(
  node: NodeDef,
  $input: Record<string, unknown>,
  prisma: PrismaClient
): Promise<Record<string, unknown>> {
  const userId = String(node.data?.userId || $input._userId || "");
  const key = String(node.data?.key || "");
  const workflowId = String(node.data?.workflowId || "");

  if (!userId || !key) return { ...$input, _memoryValue: null };

  const record = await prisma.userMemory.findUnique({
    where: { userId_key_workflowId: { userId, key, workflowId } },
  });
  return { ...$input, _memoryValue: record?.value ?? null };
}

export async function executeMemoryWrite(
  node: NodeDef,
  $input: Record<string, unknown>,
  prisma: PrismaClient
): Promise<Record<string, unknown>> {
  const userId = String(node.data?.userId || $input._userId || "");
  const key = String(node.data?.key || "");
  const workflowId = String(node.data?.workflowId || "");
  const valueKey = String(node.data?.valueKey || "_memoryValue");
  const value = node.data?.value !== undefined ? node.data.value : ($input[valueKey] ?? $input);

  if (!userId || !key) return $input;

  await prisma.userMemory.upsert({
    where: { userId_key_workflowId: { userId, key, workflowId } },
    create: { userId, key, value: JSON.parse(JSON.stringify(value)), workflowId },
    update: { value: JSON.parse(JSON.stringify(value)) },
  });
  return $input;
}
