/**
 * Content catalog routes — ported from Sea-Scyte apps/api/src/routes/catalog.ts
 *
 * Public read-only endpoints for browsing, searching, and filtering the
 * Sea-Scyte content library (music, film, TV, etc.).  No auth required.
 */
import { Router, Request, Response } from "express";
import { rawQuery } from "../lib/rawQuery";

export const catalogRouter = Router();

const PAGE_SIZE = 24;

interface ContentRow {
  id: string;
  owner_id: string;
  type: string;
  title: string;
  description: string | null;
  slug: string | null;
  status: string;
  metadata: Record<string, unknown>;
  media_urls: Record<string, unknown>;
  created_at: string;
  published_at: string | null;
}

/** GET /catalog — browse published content (all types) */
catalogRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string | undefined>;
  const type = q.type;
  const status = q.status ?? "published";
  const page = Math.max(1, parseInt(q.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: string[] = ["c.status = $1"];
  const params: unknown[] = [status];

  if (type) {
    params.push(type);
    conditions.push(`c.type = $${params.length}`);
  }

  const where = conditions.join(" AND ");
  const rows = await rawQuery<ContentRow>(
    `SELECT c.id, c.owner_id, c.type, c.title, c.description, c.slug,
            c.status, c.metadata, c.media_urls, c.created_at, c.published_at
     FROM content_assets c
     WHERE ${where}
     ORDER BY c.published_at DESC NULLS LAST, c.created_at DESC
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params,
  );

  const countRows = await rawQuery<{ count: string }>(
    `SELECT COUNT(*) as count FROM content_assets c WHERE ${where}`,
    params,
  );

  res.json({
    items: rows,
    pagination: { page, pageSize: PAGE_SIZE, total: parseInt(countRows[0]?.count ?? "0", 10) },
  });
});

/** GET /catalog/search — full-text + filter search */
catalogRouter.get("/search", async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string | undefined>;
  const searchTerm = q.q?.trim();
  const type = q.type;
  const page = Math.max(1, parseInt(q.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: string[] = ["c.status = 'published'"];
  const params: unknown[] = [];

  if (searchTerm) {
    params.push(`%${searchTerm}%`);
    conditions.push(`(c.title ILIKE $${params.length} OR c.description ILIKE $${params.length})`);
  }
  if (type) {
    params.push(type);
    conditions.push(`c.type = $${params.length}`);
  }

  const where = conditions.join(" AND ");
  const rows = await rawQuery<Pick<ContentRow, "id" | "type" | "title" | "description" | "slug" | "metadata" | "media_urls" | "published_at">>(
    `SELECT c.id, c.type, c.title, c.description, c.slug, c.metadata, c.media_urls, c.published_at
     FROM content_assets c
     WHERE ${where}
     ORDER BY c.published_at DESC NULLS LAST
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params,
  );

  res.json({ items: rows, query: searchTerm ?? null });
});

/** GET /catalog/film-tv — Film & TV catalog */
catalogRouter.get("/film-tv", async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string | undefined>;
  const type = q.type ?? null;
  const page = Math.max(1, parseInt(q.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const allowedTypes = ["film", "tv_episode", "tv_series", "documentary"];
  const params: unknown[] = [];
  const conditions: string[] = ["c.status = 'published'"];

  if (type && allowedTypes.includes(type)) {
    params.push(type);
    conditions.push(`c.type = $${params.length}`);
  } else {
    params.push(allowedTypes);
    conditions.push(`c.type = ANY($${params.length})`);
  }

  const where = conditions.join(" AND ");
  const rows = await rawQuery<Pick<ContentRow, "id" | "type" | "title" | "description" | "slug" | "metadata" | "media_urls" | "published_at">>(
    `SELECT c.id, c.type, c.title, c.description, c.slug, c.metadata, c.media_urls, c.published_at
     FROM content_assets c WHERE ${where}
     ORDER BY c.published_at DESC NULLS LAST
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params,
  );

  res.json({ items: rows });
});

/** GET /catalog/film-tv/:id — single Film/TV asset with licensing terms */
catalogRouter.get("/film-tv/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const rows = await rawQuery<ContentRow & {
    sync_available: boolean | null;
    commercial_use: boolean | null;
    territories: string[] | null;
    exclusivity: string | null;
  }>(
    `SELECT c.*, lt.sync_available, lt.commercial_use, lt.territories, lt.exclusivity
     FROM content_assets c
     LEFT JOIN licensing_terms lt ON lt.content_id = c.id
     WHERE c.id = $1 AND c.status = 'published'`,
    [id],
  );
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(rows[0]);
});

/** GET /catalog/music — music catalog (tracks and albums) */
catalogRouter.get("/music", async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string | undefined>;
  const type = q.type ?? null;
  const page = Math.max(1, parseInt(q.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const allowedTypes = ["track", "album"];
  const params: unknown[] = [];
  const conditions: string[] = ["c.status = 'published'"];

  if (type && allowedTypes.includes(type)) {
    params.push(type);
    conditions.push(`c.type = $${params.length}`);
  } else {
    params.push(allowedTypes);
    conditions.push(`c.type = ANY($${params.length})`);
  }

  const where = conditions.join(" AND ");
  const rows = await rawQuery<Pick<ContentRow, "id" | "type" | "title" | "description" | "slug" | "metadata" | "media_urls" | "published_at">>(
    `SELECT c.id, c.type, c.title, c.description, c.slug, c.metadata, c.media_urls, c.published_at
     FROM content_assets c WHERE ${where}
     ORDER BY c.published_at DESC NULLS LAST
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params,
  );

  res.json({ items: rows });
});
