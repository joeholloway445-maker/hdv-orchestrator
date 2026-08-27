/**
 * Dashboard route — ported from Sea-Scyte apps/api/src/routes/dashboard.ts
 *
 * Returns a consolidated view of the authenticated user's profile, wallet,
 * active membership, recent wallet activity, and content recommendations.
 * All queries run in parallel for minimal latency.
 *
 * Requires auth (wired via verifyToken in index.ts).
 */
import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { rawQuery } from "../lib/rawQuery";

export const dashboardRouter = Router();

/** GET /dashboard — aggregated dashboard for the authenticated user */
dashboardRouter.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [
    profileRows,
    walletRows,
    membershipRows,
    recentActivityRows,
    recommendationRows,
  ] = await Promise.all([
    rawQuery<{ id: string; email: string; display_name: string | null; role: string }>(
      "SELECT id, email, display_name, role FROM users WHERE id = $1",
      [uid],
    ),
    rawQuery<{ balance_cents: number; currency: string }>(
      "SELECT balance_cents, currency FROM wallet_accounts WHERE user_id = $1",
      [uid],
    ),
    rawQuery<{ tier: string; is_active: boolean; ends_at: string | null }>(
      `SELECT tier, is_active, ends_at FROM memberships
       WHERE user_id = $1 AND is_active = true
       ORDER BY starts_at DESC LIMIT 1`,
      [uid],
    ),
    rawQuery<{ id: string; type: string; amount_cents: number; description: string | null; created_at: string }>(
      `SELECT wt.id, wt.type, wt.amount_cents, wt.description, wt.created_at
       FROM wallet_transactions wt
       JOIN wallet_accounts wa ON wa.id = wt.wallet_id
       WHERE wa.user_id = $1
       ORDER BY wt.created_at DESC LIMIT 5`,
      [uid],
    ),
    rawQuery<{ id: string; type: string; title: string; slug: string | null; metadata: Record<string, unknown> }>(
      `SELECT id, type, title, slug, metadata
       FROM content_assets
       WHERE status = 'published'
       ORDER BY published_at DESC NULLS LAST
       LIMIT 6`,
      [],
    ),
  ]);

  res.json({
    profile: profileRows[0] ?? null,
    wallet: walletRows[0] ?? null,
    membership: membershipRows[0] ?? null,
    recentActivity: recentActivityRows,
    recommendations: recommendationRows,
  });
});
