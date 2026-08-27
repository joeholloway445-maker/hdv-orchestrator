/**
 * Stripe webhook handler — ported from Sea-Scyte apps/api/src/routes/stripe.ts
 *
 * Processes Stripe events to:
 *   - Credit wallet on one-time checkout.session.completed (wallet top-up)
 *   - Activate membership on invoice.paid (subscription tier upgrade)
 *   - Handle subscription updates and cancellations
 *   - Reverse wallet credit on charge.refunded
 *
 * IMPORTANT — signature verification:
 *   This handler currently accepts the raw JSON body without verifying the
 *   Stripe-Signature header.  To enable proper verification in production:
 *   1. `npm install stripe --workspace=packages/api`
 *   2. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars
 *   3. Replace the body parsing below with stripe.webhooks.constructEvent()
 *
 * Mount BEFORE express.json() or on a dedicated sub-app so the raw buffer is
 * available (see index.ts).
 */
import { Router, Request, Response } from "express";
import { rawQuery } from "../lib/rawQuery";

export const stripeWebhookRouter = Router();

const TIER_BY_PRICE: Record<string, string> = {
  [process.env.STRIPE_PRICE_PRO ?? "price_pro"]: "pro",
  [process.env.STRIPE_PRICE_VIP ?? "price_vip"]: "vip",
};

const TIER_FEATURES: Record<string, string[]> = {
  pro: ["hd_streaming", "downloads", "early_access"],
  vip: ["hd_streaming", "downloads", "early_access", "4k_streaming", "exclusive_content", "creator_tools"],
};

async function creditWallet(userId: string, amountCents: number, description: string): Promise<void> {
  await rawQuery(
    "UPDATE wallet_accounts SET balance_cents = balance_cents + $1 WHERE user_id = $2",
    [amountCents, userId],
  );
  await rawQuery(
    `INSERT INTO wallet_transactions (wallet_id, type, amount_cents, description)
     SELECT id, 'credit', $1, $2 FROM wallet_accounts WHERE user_id = $3`,
    [amountCents, description, userId],
  );
}

async function activateMembership(
  userId: string,
  tier: string,
  stripeSubscriptionId: string,
  periodEnd: Date,
): Promise<void> {
  await rawQuery(
    "UPDATE memberships SET is_active = false WHERE user_id = $1 AND is_active = true",
    [userId],
  );
  await rawQuery(
    `INSERT INTO memberships (user_id, tier, is_active, starts_at, ends_at, stripe_subscription_id)
     VALUES ($1, $2, true, now(), $3, $4)
     ON CONFLICT (stripe_subscription_id)
     DO UPDATE SET is_active = true, ends_at = EXCLUDED.ends_at`,
    [userId, tier, periodEnd, stripeSubscriptionId],
  );
  const features = TIER_FEATURES[tier] ?? [];
  for (const feature of features) {
    await rawQuery(
      `INSERT INTO entitlements (user_id, feature_key, granted_at, expires_at)
       VALUES ($1, $2, now(), $3)
       ON CONFLICT (user_id, feature_key) DO UPDATE SET granted_at = now(), expires_at = EXCLUDED.expires_at`,
      [userId, feature, periodEnd],
    );
  }
}

async function deactivateMembership(stripeSubscriptionId: string): Promise<void> {
  await rawQuery(
    "UPDATE memberships SET is_active = false WHERE stripe_subscription_id = $1",
    [stripeSubscriptionId],
  );
}

async function findUserByCustomer(customerId: string): Promise<string | null> {
  const rows = await rawQuery<{ id: string }>(
    "SELECT id FROM users WHERE stripe_customer_id = $1",
    [customerId],
  );
  return rows[0]?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEvent(event: { type: string; data: { object: any } }): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = event.data.object as any;

  switch (event.type) {
    case "checkout.session.completed": {
      const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      if (!customerId) break;
      const userId = await findUserByCustomer(customerId);
      if (!userId) break;
      if (obj.mode === "payment" && obj.amount_total) {
        await creditWallet(userId, obj.amount_total as number, "Wallet top-up via Stripe checkout");
      }
      break;
    }

    case "invoice.paid": {
      const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      if (!customerId) break;
      const userId = await findUserByCustomer(customerId);
      if (!userId) break;
      const subscriptionId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id;
      if (!subscriptionId) break;

      const lineItems: { price?: { id: string }; period?: { end: number } }[] = obj.lines?.data ?? [];
      let tier: string | undefined;
      for (const line of lineItems) {
        const priceId = line.price?.id;
        if (priceId && TIER_BY_PRICE[priceId]) { tier = TIER_BY_PRICE[priceId]; break; }
      }
      if (!tier) break;

      const periodEnd = new Date(((lineItems[0]?.period?.end ?? Date.now() / 1000 + 30 * 86400)) * 1000);
      await activateMembership(userId, tier, subscriptionId, periodEnd);

      if (obj.metadata?.type === "creator_payout" && obj.amount_paid) {
        await rawQuery(
          "INSERT INTO royalty_payouts (user_id, amount_cents, paid_at, reference) VALUES ($1, $2, now(), $3)",
          [userId, obj.amount_paid as number, obj.id as string],
        );
      }
      break;
    }

    case "customer.subscription.updated": {
      const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      if (!customerId) break;
      const userId = await findUserByCustomer(customerId);
      if (!userId) break;
      if (obj.status === "active" || obj.status === "trialing") {
        const priceId = obj.items?.data?.[0]?.price?.id as string | undefined;
        const tier = priceId ? (TIER_BY_PRICE[priceId] ?? "basic") : "basic";
        const periodEnd = new Date((obj.current_period_end as number) * 1000);
        await activateMembership(userId, tier, obj.id as string, periodEnd);
      } else if (obj.status === "canceled" || obj.status === "unpaid") {
        await deactivateMembership(obj.id as string);
      }
      break;
    }

    case "customer.subscription.deleted": {
      await deactivateMembership(obj.id as string);
      break;
    }

    case "charge.refunded": {
      const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      if (!customerId) break;
      const userId = await findUserByCustomer(customerId);
      if (!userId) break;
      const refunded = obj.amount_refunded as number;
      if (refunded > 0) {
        const piId = typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id;
        await rawQuery(
          "UPDATE wallet_accounts SET balance_cents = GREATEST(0, balance_cents - $1) WHERE user_id = $2",
          [refunded, userId],
        );
        await rawQuery(
          `INSERT INTO wallet_transactions (wallet_id, type, amount_cents, description)
           SELECT id, 'debit', $1, $2 FROM wallet_accounts WHERE user_id = $3`,
          [refunded, `Refund for charge ${obj.id as string}${piId ? ` (PI: ${piId})` : ""}`, userId],
        );
      }
      break;
    }

    default:
      // Unhandled event — no-op
      break;
  }
}

/**
 * POST /stripe/webhook
 *
 * Mount this handler BEFORE the global express.json() middleware so the raw
 * body buffer is available for future Stripe signature verification.  A
 * dedicated express.json() is applied here for now.
 */
stripeWebhookRouter.post(
  "/",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req: any, _res: any, next: any) => {
    // When express.raw() is applied upstream, body is already a Buffer.
    // Fall through to the async handler regardless.
    next();
  },
  async (req: Request, res: Response): Promise<void> => {
    // TODO: verify Stripe-Signature header once stripe package is installed.
    // const sig = req.headers["stripe-signature"];
    // event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let event: { type: string; data: { object: any } };
    try {
      event = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as typeof event;
      if (!event?.type) throw new Error("Missing event.type");
    } catch {
      res.status(400).json({ error: "Invalid event payload" });
      return;
    }

    try {
      await handleEvent(event);
    } catch (err) {
      console.error("[stripe-webhook] Error processing event", event.type, err);
      res.status(500).json({ error: "Internal error processing webhook" });
      return;
    }

    res.json({ received: true });
  },
);
