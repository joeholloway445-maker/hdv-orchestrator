/**
 * Membership routes — ported from Sea-Scyte apps/api/src/routes/membership.ts
 *
 * Manages subscription tiers (basic / pro / vip), entitlement grants, and
 * cancellation.  All routes require auth (wired via verifyToken in index.ts).
 *
 * NOTE: Production implementations should replace the direct wallet deduction
 * with a Stripe Subscription flow (see stripeWebhook.ts).
 */
import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { rawQuery } from "../lib/rawQuery";

export const membershipRouter = Router();

type Tier = "basic" | "pro" | "vip";

const VALID_TIERS: Tier[] = ["basic", "pro", "vip"];

const TIER_PRICES: Record<Tier, number> = {
  basic: 0,
  pro: 999,   // $9.99/mo in cents
  vip: 2999,  // $29.99/mo in cents
};

const TIER_FEATURES: Record<Tier, string[]> = {
  basic: ["catalog:browse", "music:stream:sd"],
  pro: ["catalog:browse", "music:stream:hd", "film:hd", "downloads:limited"],
  vip: ["catalog:browse", "music:stream:hd", "film:4k", "downloads:unlimited", "early_access", "creator:tools"],
};

interface MembershipRow {
  id: string;
  tier: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
}

interface EntitlementRow {
  id: string;
  feature_key: string;
  granted_by: string | null;
  expires_at: string | null;
}

/** GET /membership — current membership and entitlements */
membershipRouter.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const membershipRows = await rawQuery<MembershipRow>(
    `SELECT id, tier, is_active, starts_at, ends_at
     FROM memberships WHERE user_id = $1 AND is_active = true
     ORDER BY starts_at DESC LIMIT 1`,
    [uid],
  );
  const membership = membershipRows[0] ?? null;

  const entitlements = await rawQuery<EntitlementRow>(
    `SELECT id, feature_key, granted_by, expires_at
     FROM entitlements
     WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())`,
    [uid],
  );

  res.json({
    membership,
    entitlements,
    tierFeatures: membership ? (TIER_FEATURES[membership.tier as Tier] ?? []) : [],
  });
});

/** POST /membership/subscribe — activate or upgrade a membership tier */
membershipRouter.post("/subscribe", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { tier } = req.body as { tier?: unknown };
  if (!tier || !VALID_TIERS.includes(tier as Tier)) {
    res.status(400).json({ error: `tier must be one of: ${VALID_TIERS.join(", ")}` });
    return;
  }
  const t = tier as Tier;
  const priceCents = TIER_PRICES[t];

  // Deactivate existing active memberships
  await rawQuery(
    "UPDATE memberships SET is_active = false WHERE user_id = $1 AND is_active = true",
    [uid],
  );

  // Deduct from wallet if paid tier (production: use Stripe Subscription instead)
  if (priceCents > 0) {
    const walletRows = await rawQuery<{ id: string; balance_cents: number }>(
      "SELECT id, balance_cents FROM wallet_accounts WHERE user_id = $1",
      [uid],
    );
    const wallet = walletRows[0];
    if (!wallet || wallet.balance_cents < priceCents) {
      res.status(402).json({ error: "Insufficient wallet balance", required: priceCents });
      return;
    }
    const newBalance = wallet.balance_cents - priceCents;
    await rawQuery("UPDATE wallet_accounts SET balance_cents = $1 WHERE id = $2", [newBalance, wallet.id]);
    await rawQuery(
      `INSERT INTO wallet_transactions (wallet_id, type, amount_cents, balance_after, description)
       VALUES ($1, 'purchase', $2, $3, $4)`,
      [wallet.id, priceCents, newBalance, `Membership: ${t}`],
    );
  }

  const endsAt = new Date();
  endsAt.setMonth(endsAt.getMonth() + 1);

  const newRows = await rawQuery<MembershipRow>(
    `INSERT INTO memberships (user_id, tier, is_active, ends_at)
     VALUES ($1, $2, true, $3)
     RETURNING id, tier, is_active, starts_at, ends_at`,
    [uid, t, endsAt.toISOString()],
  );

  // Grant tier entitlements
  const features = TIER_FEATURES[t] ?? [];
  for (const featureKey of features) {
    await rawQuery(
      `INSERT INTO entitlements (user_id, feature_key, granted_by, expires_at)
       VALUES ($1, $2, 'membership', $3)
       ON CONFLICT (user_id, feature_key) DO UPDATE SET expires_at = EXCLUDED.expires_at, granted_by = 'membership'`,
      [uid, featureKey, endsAt.toISOString()],
    );
  }

  res.status(201).json({ membership: newRows[0], entitlements: features });
});

/** POST /membership/cancel — cancel the active membership */
membershipRouter.post("/cancel", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await rawQuery<MembershipRow>(
    `UPDATE memberships SET is_active = false
     WHERE user_id = $1 AND is_active = true
     RETURNING id, tier`,
    [uid],
  );
  if (result.length === 0) {
    res.status(404).json({ error: "No active membership" });
    return;
  }
  res.json({ cancelled: true, tier: result[0].tier });
});
