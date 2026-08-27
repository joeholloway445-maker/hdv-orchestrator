/**
 * News / CMS article routes — ported from Sea-Scyte apps/api/src/routes/news.ts
 *
 * Public read-only endpoints; no auth required.
 */
import { Router, Request, Response } from "express";
import { rawQuery } from "../lib/rawQuery";

export const newsRouter = Router();

interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  author: string | null;
  tags: string[];
  published_at: string | null;
  created_at: string;
}

/** GET /news — paginated published articles, optionally filtered by tag */
newsRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string | undefined>;
  const tag = q.tag;
  const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "20", 10)));
  const offset = Math.max(0, parseInt(q.offset ?? "0", 10));

  const articles = await rawQuery<ArticleRow>(
    `SELECT id, title, slug, excerpt, author, tags, published_at, created_at
     FROM articles
     WHERE status = 'published'
       ${tag ? `AND $3 = ANY(tags)` : ""}
     ORDER BY published_at DESC NULLS LAST, created_at DESC
     LIMIT $1 OFFSET $2`,
    tag ? [limit, offset, tag] : [limit, offset],
  );

  const totalRows = await rawQuery<{ count: string }>(
    `SELECT COUNT(*) AS count FROM articles WHERE status = 'published'${tag ? ` AND $1 = ANY(tags)` : ""}`,
    tag ? [tag] : [],
  );

  res.json({
    items: articles,
    total: Number(totalRows[0]?.count ?? 0),
    limit,
    offset,
  });
});

/** GET /news/:slug — single article with full body */
newsRouter.get("/:slug", async (req: Request, res: Response): Promise<void> => {
  const { slug } = req.params;
  const rows = await rawQuery<ArticleRow>(
    `SELECT id, title, slug, excerpt, body, author, tags, published_at, created_at
     FROM articles WHERE slug = $1 AND status = 'published'`,
    [slug],
  );
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(rows[0]);
});
