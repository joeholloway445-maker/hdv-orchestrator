import { interpolate } from "../lib/expr";
import { createConnection as createMysqlConnection } from "mysql2/promise";
import { Client as PgClient } from "pg";

interface NodeDef {
  data: Record<string, unknown>;
}

export async function executeDatabase(node: NodeDef, $input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const dialect = String(node.data?.dialect || "postgres").toLowerCase();
  const host = String(interpolate(String(node.data?.host || "localhost"), $input) ?? "localhost");
  const port = Number(node.data?.port || (dialect === "mysql" ? 3306 : 5432));
  const database = String(interpolate(String(node.data?.database || ""), $input) ?? "");
  const user = String(interpolate(String(node.data?.user || ""), $input) ?? "");
  const password = String(interpolate(String(node.data?.password || ""), $input) ?? "");
  const rawQuery = String(node.data?.query || "");
  const query = String(interpolate(rawQuery, $input) ?? rawQuery);
  const operation = String(node.data?.operation || "query");

  if (dialect === "mysql") {
    const conn = await createMysqlConnection({ host, port, database, user, password });
    try {
      const [rows] = await conn.execute(query);
      return { ...$input, rows, rowCount: Array.isArray(rows) ? rows.length : 0 };
    } finally {
      await conn.end();
    }
  }

  // Default: Postgres
  const client = new PgClient({ host, port, database, user, password });
  await client.connect();
  try {
    const result = await client.query(query);
    if (operation === "query") {
      return { ...$input, rows: result.rows, rowCount: result.rowCount ?? 0, fields: result.fields.map((f) => f.name) };
    }
    return { ...$input, rowCount: result.rowCount ?? 0 };
  } finally {
    await client.end();
  }
}
