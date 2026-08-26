export function parsePagination(query: Record<string, unknown>) {
  const limit = Math.min(Number(query.limit) || 20, 100);
  const offset = Number(query.offset) || 0;
  return { limit, offset };
}
