/**
 * Thin wrapper around Prisma's $queryRawUnsafe so that route files ported from
 * Sea-Scyte can keep the same `query<T>(sql, params)` call-signature without
 * pulling in a separate pg Pool.  Positional placeholders use PostgreSQL $N
 * notation (e.g. $1, $2), which Prisma passes through unchanged.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function rawQuery<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql, ...params);
}
