/**
 * Content distribution routes — ported from Sea-Scyte apps/api/src/routes/distribution.ts
 *
 * Provides upload initiation, upload listing, licensing term management, and a
 * creator-facing music catalog view.  All routes require auth (wired via
 * verifyToken in index.ts).
 *
 * Upload URLs: in production, generate a pre-signed S3 URL in the POST
 * /distribution/upload handler and return it as uploadUrl.
 */
import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { rawQuery } from "../lib/rawQuery";

export const distributionRouter = Router();

const PAGE_SIZE = 20;

interface UploadRow {
  id: string;
  content_id: string | null;
  original_filename: string;
  storage_key: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  processing_status: string;
  created_at: string;
}

/** POST /distribution/upload — initiate a content upload */
distributionRouter.post("/upload", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { filename, mimeType, fileSizeBytes, contentId } = req.body as {
    filename?: unknown;
    mimeType?: string;
    fileSizeBytes?: unknown;
    contentId?: string;
  };

  if (typeof filename !== "string" || !filename) {
    res.status(400).json({ error: "filename is required" });
    return;
  }
  if (fileSizeBytes !== undefined && (typeof fileSizeBytes !== "number" || !Number.isInteger(fileSizeBytes) || fileSizeBytes <= 0)) {
    res.status(400).json({ error: "fileSizeBytes must be a positive integer" });
    return;
  }

  const rows = await rawQuery<UploadRow>(
    `INSERT INTO distribution_uploads
       (content_id, uploader_id, original_filename, mime_type, file_size_bytes, processing_status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id, content_id, original_filename, mime_type, file_size_bytes, processing_status, created_at`,
    [contentId ?? null, uid, filename, mimeType ?? null, fileSizeBytes ?? null],
  );

  res.status(201).json({
    upload: rows[0],
    uploadUrl: null,
    note: "Configure S3_BUCKET and AWS credentials to receive a real pre-signed upload URL",
  });
});

/** GET /distribution/uploads — list uploads for the authenticated creator */
distributionRouter.get("/uploads", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, parseInt(q.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const uploads = await rawQuery<UploadRow>(
    `SELECT id, content_id, original_filename, mime_type, file_size_bytes, processing_status, created_at
     FROM distribution_uploads
     WHERE uploader_id = $1
     ORDER BY created_at DESC
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    [uid],
  );
  res.json({ uploads, page, pageSize: PAGE_SIZE });
});

/** POST /distribution/:contentId/licensing — upsert licensing terms for owned content */
distributionRouter.post("/:contentId/licensing", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { contentId } = req.params;
  const {
    syncAvailable = false,
    commercialUse = false,
    adSyncRights = false,
    territories = [],
    exclusivity,
    startDate,
    endDate,
  } = req.body as {
    syncAvailable?: boolean;
    commercialUse?: boolean;
    adSyncRights?: boolean;
    territories?: string[];
    exclusivity?: "exclusive" | "non_exclusive" | "windowed";
    startDate?: string;
    endDate?: string;
  };

  // Verify ownership
  const assetRows = await rawQuery<{ id: string }>(
    "SELECT id FROM content_assets WHERE id = $1 AND owner_id = $2",
    [contentId, uid],
  );
  if (!assetRows[0]) {
    res.status(404).json({ error: "Content asset not found or not owned by you" });
    return;
  }

  await rawQuery("DELETE FROM licensing_terms WHERE content_id = $1", [contentId]);
  const termRows = await rawQuery(
    `INSERT INTO licensing_terms
       (content_id, sync_available, commercial_use, ad_sync_rights, territories, exclusivity, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [contentId, syncAvailable, commercialUse, adSyncRights, territories, exclusivity ?? null, startDate ?? null, endDate ?? null],
  );
  res.json({ licensingTerms: termRows[0] });
});

/** GET /distribution/creator-music — creator's own music with upload processing status */
distributionRouter.get("/creator-music", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, parseInt(q.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const assets = await rawQuery(
    `SELECT c.id, c.type, c.title, c.status, c.metadata, c.created_at,
            du.processing_status as upload_status
     FROM content_assets c
     LEFT JOIN distribution_uploads du ON du.content_id = c.id
     WHERE c.owner_id = $1 AND c.type IN ('track', 'album')
     ORDER BY c.created_at DESC
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    [uid],
  );
  res.json({ assets, page, pageSize: PAGE_SIZE });
});
