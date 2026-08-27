/**
 * Wallet routes — ported from Sea-Scyte apps/api/src/routes/wallet.ts
 *
 * Provides balance read, transaction history, deposit (dev mode), payout stub,
 * transfer stub, and creator analytics.  All routes require auth (wired via
 * verifyToken in index.ts).
 *
 * The underlying tables (wallet_accounts, wallet_transactions) are maintained
 * by Sea-Scyte's database migrations; this file just exposes them over the
 * HDV API layer.
 */
import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { rawQuery } from "../lib/rawQuery";

export const walletRouter = Router();

interface WalletRow {
  id: string;
  user_id: string;
  balance_cents: number;
  currency: string;
}

interface TxRow {
  id: string;
  type: string;
  amount_cents: number;
  balance_after: number;
  source_ref: string | null;
  description: string | null;
  created_at: string;
}

/** GET /wallet — current balance */
walletRouter.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await rawQuery<WalletRow>(
    "SELECT id, balance_cents, currency FROM wallet_accounts WHERE user_id = $1",
    [uid],
  );
  const wallet = rows[0];
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }
  res.json({ balanceCents: wallet.balance_cents, currency: wallet.currency });
});

/** GET /wallet/transactions — paginated transaction history */
walletRouter.get("/transactions", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const q = req.query as Record<string, string | undefined>;
  const limit = Math.min(100, parseInt(q.limit ?? "50", 10));
  const offset = parseInt(q.offset ?? "0", 10);

  const walletRows = await rawQuery<WalletRow>(
    "SELECT id FROM wallet_accounts WHERE user_id = $1",
    [uid],
  );
  const wallet = walletRows[0];
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  const txs = await rawQuery<TxRow>(
    `SELECT id, type, amount_cents, balance_after, source_ref, description, created_at
     FROM wallet_transactions
     WHERE wallet_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [wallet.id, limit, offset],
  );
  res.json({ transactions: txs });
});

/** POST /wallet/deposit — credit wallet (dev mode; production should gate behind Stripe webhook) */
walletRouter.post("/deposit", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { amountCents, description } = req.body as { amountCents?: unknown; description?: string };
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
    res.status(400).json({ error: "amountCents must be a positive integer" });
    return;
  }

  const walletRows = await rawQuery<WalletRow>(
    "SELECT id, balance_cents FROM wallet_accounts WHERE user_id = $1",
    [uid],
  );
  const wallet = walletRows[0];
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  const newBalance = wallet.balance_cents + amountCents;
  await rawQuery(
    "UPDATE wallet_accounts SET balance_cents = $1 WHERE id = $2",
    [newBalance, wallet.id],
  );

  const txRows = await rawQuery<TxRow>(
    `INSERT INTO wallet_transactions (wallet_id, type, amount_cents, balance_after, description)
     VALUES ($1, 'deposit', $2, $3, $4)
     RETURNING id, type, amount_cents, balance_after, description, created_at`,
    [wallet.id, amountCents, newBalance, description ?? "Manual deposit"],
  );

  res.status(201).json({ transaction: txRows[0], balanceCents: newBalance });
});

/** POST /wallet/payout — stub pending Stripe payout integration */
walletRouter.post("/payout", async (_req: AuthRequest, res: Response): Promise<void> => {
  res.status(503).json({ error: "Payout not yet configured", status: "pending_stripe_setup" });
});

/** POST /wallet/transfer — stub pending KYC/AML clearance */
walletRouter.post("/transfer", async (_req: AuthRequest, res: Response): Promise<void> => {
  res.status(403).json({
    error: "P2P transfers are gated pending KYC/AML clearance",
    status: "kyc_required",
  });
});

/** GET /wallet/creator-analytics — aggregated royalty summary for the authenticated creator */
walletRouter.get("/creator-analytics", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const walletRows = await rawQuery<WalletRow>(
    "SELECT id FROM wallet_accounts WHERE user_id = $1",
    [uid],
  );
  const wallet = walletRows[0];
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  const rows = await rawQuery<{ total_cents: string; payout_count: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total_cents,
            COUNT(*) as payout_count
     FROM wallet_transactions
     WHERE wallet_id = $1 AND type = 'royalty_payout'`,
    [wallet.id],
  );
  const summary = rows[0] ?? { total_cents: "0", payout_count: "0" };
  res.json({
    totalRoyaltyCents: parseInt(summary.total_cents, 10),
    payoutCount: parseInt(summary.payout_count, 10),
  });
});
