import type { PrismaClient } from "@prisma/client";

let cache: Record<string, unknown> | null = null;
let cacheUserId = "";
let cacheAt = 0;
const TTL_MS = 30_000;

export async function getGlobalVars(prisma: PrismaClient, userId: string): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (cache && cacheUserId === userId && now - cacheAt < TTL_MS) return cache;

  const rows = await (prisma as any).globalVariable.findMany({ where: { userId } });
  const result: Record<string, unknown> = {};
  for (const row of rows) result[row.key] = row.value;

  cache = result;
  cacheUserId = userId;
  cacheAt = now;
  return result;
}

export function injectGlobalVars(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*\$vars\.([^}\s]+)\s*\}\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined ? String(val) : "";
  });
}
