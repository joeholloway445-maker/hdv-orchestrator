import { interpolate } from "../lib/expr";
import { createConnection as createMysqlConnection } from "mysql2/promise";
import { Client as PgClient } from "pg";
import { PrismaClient } from "@prisma/client";
import { decrypt } from "../lib/crypto";

interface NodeDef {
  data: Record<string, unknown>;
}

export async function executeDatabase(
  node: NodeDef,
  $input: Record<string, unknown>,
  prisma?: PrismaClient,
): Promise<Record<string, unknown>> {
  const dialect = String(node.data?.dialect || "postgres").toLowerCase();
  let host = String(interpolate(String(node.data?.host || "localhost"), $input) ?? "localhost");
  let port = Number(node.data?.port || (dialect === "mysql" ? 3306 : 5432));
  let database = String(interpolate(String(node.data?.database || ""), $input) ?? "");
  let user = String(interpolate(String(node.data?.user || ""), $input) ?? "");
  let password = String(interpolate(String(node.data?.password || ""), $input) ?? "");

  // Load connection details from a stored credential if specified
  const credentialId = node.data?.credentialId ? String(node.data.credentialId) : "";
  if (credentialId && prisma) {
    try {
      const cred = await prisma.credential.findUnique({ where: { id: credentialId } });
      if (cred) {
        const raw = JSON.parse(decrypt(cred.data)) as Record<string, unknown>;
        if (raw.host) host = String(raw.host);
        if (raw.port) port = Number(raw.port);
        if (raw.database) database = String(raw.database);
        if (raw.user || raw.username) user = String(raw.user || raw.username);
        if (raw.password) password = String(raw.password);
      }
    } catch { /* credential not found or decrypt failed — fall through to node fields */ }
  }

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
