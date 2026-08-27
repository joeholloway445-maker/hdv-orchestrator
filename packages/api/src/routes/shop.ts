/**
 * Shop routes — ported from Sea-Scyte apps/api/src/routes/shop.ts
 *
 * Physical merchandise catalog + cart + checkout.  Browse is public;
 * cart/checkout/orders require auth (checked inline via req.userId).
 */
import { Router, Request, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { rawQuery } from "../lib/rawQuery";

export const shopRouter = Router();

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  stock: number;
  category: string | null;
  images: string[];
  metadata: Record<string, unknown>;
}

interface CartItemRow {
  id: string;
  product_id: string;
  quantity: number;
  product_name: string;
  price_cents: number;
  stock: number;
}

interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  total_cents: number;
  created_at: string;
}

/** GET /shop — browse physical merch catalog */
shopRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string | undefined>;
  const category = q.category;
  const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "24", 10)));
  const offset = Math.max(0, parseInt(q.offset ?? "0", 10));

  const products = await rawQuery<ProductRow>(
    `SELECT id, name, description, price_cents, currency, stock, category, images, metadata
     FROM shop_products
     WHERE is_active = true
       ${category ? `AND category = $3` : ""}
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    category ? [limit, offset, category] : [limit, offset],
  );

  const countRows = await rawQuery<{ count: string }>(
    `SELECT COUNT(*) AS count FROM shop_products WHERE is_active = true${category ? ` AND category = $1` : ""}`,
    category ? [category] : [],
  );

  res.json({ items: products, total: Number(countRows[0]?.count ?? 0), limit, offset });
});

/** GET /shop/cart — view current user's cart */
shopRouter.get("/cart", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const items = await rawQuery<CartItemRow>(
    `SELECT ci.id, ci.product_id, ci.quantity,
            sp.name AS product_name, sp.price_cents, sp.stock
     FROM cart_items ci
     JOIN shop_products sp ON sp.id = ci.product_id
     WHERE ci.user_id = $1`,
    [uid],
  );
  const subtotal = items.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  res.json({ items, subtotal });
});

/** POST /shop/cart — add or update an item in the cart */
shopRouter.post("/cart", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { productId, quantity } = req.body as { productId?: unknown; quantity?: unknown };
  if (typeof productId !== "string" || !productId) {
    res.status(400).json({ error: "productId must be a non-empty string" });
    return;
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
    res.status(400).json({ error: "quantity must be an integer 0–99 (0 removes the item)" });
    return;
  }

  const productRows = await rawQuery<{ id: string; stock: number }>(
    "SELECT id, stock FROM shop_products WHERE id = $1 AND is_active = true",
    [productId],
  );
  const product = productRows[0];
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  if (product.stock < quantity) {
    res.status(409).json({ error: "Insufficient stock", available: product.stock });
    return;
  }

  if (quantity === 0) {
    await rawQuery("DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2", [uid, productId]);
    res.json({ removed: true });
    return;
  }

  await rawQuery(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
    [uid, productId, quantity],
  );
  res.json({ added: true, productId, quantity });
});

/** DELETE /shop/cart — clear the entire cart */
shopRouter.delete("/cart", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  await rawQuery("DELETE FROM cart_items WHERE user_id = $1", [uid]);
  res.json({ cleared: true });
});

/** POST /shop/checkout — convert cart to a confirmed order */
shopRouter.post("/checkout", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { paymentMethod = "wallet", shippingAddress } = req.body as {
    paymentMethod?: "wallet" | "card";
    shippingAddress?: {
      name: string;
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
  };

  if (!shippingAddress?.name || !shippingAddress?.line1 || !shippingAddress?.city ||
      !shippingAddress?.postalCode || !shippingAddress?.country) {
    res.status(400).json({ error: "shippingAddress with name, line1, city, postalCode, country required" });
    return;
  }

  const cartItems = await rawQuery<CartItemRow>(
    `SELECT ci.id, ci.product_id, ci.quantity, sp.name AS product_name, sp.price_cents, sp.stock
     FROM cart_items ci
     JOIN shop_products sp ON sp.id = ci.product_id
     WHERE ci.user_id = $1`,
    [uid],
  );
  if (cartItems.length === 0) { res.status(400).json({ error: "Cart is empty" }); return; }

  for (const item of cartItems) {
    if (item.stock < item.quantity) {
      res.status(409).json({ error: "Insufficient stock", productId: item.product_id, available: item.stock });
      return;
    }
  }

  const totalCents = cartItems.reduce((s, i) => s + i.price_cents * i.quantity, 0);

  if (paymentMethod === "wallet") {
    const walletRows = await rawQuery<{ balance_cents: number }>(
      "SELECT balance_cents FROM wallet_accounts WHERE user_id = $1",
      [uid],
    );
    const wallet = walletRows[0];
    if (!wallet || wallet.balance_cents < totalCents) {
      res.status(402).json({
        error: "Insufficient wallet balance",
        required: totalCents,
        available: wallet?.balance_cents ?? 0,
      });
      return;
    }
    await rawQuery(
      "UPDATE wallet_accounts SET balance_cents = balance_cents - $1 WHERE user_id = $2",
      [totalCents, uid],
    );
    await rawQuery(
      `INSERT INTO wallet_transactions (wallet_id, type, amount_cents, description)
       SELECT id, 'debit', $1, 'Shop order' FROM wallet_accounts WHERE user_id = $2`,
      [totalCents, uid],
    );
  } else {
    res.status(501).json({
      error: "Card payment requires Stripe Payment Intent flow",
      hint: "Integrate frontend Stripe card payment, then call POST /shop/checkout with paymentMethod=wallet after wallet top-up.",
    });
    return;
  }

  for (const item of cartItems) {
    await rawQuery(
      "UPDATE shop_products SET stock = stock - $1 WHERE id = $2",
      [item.quantity, item.product_id],
    );
  }

  const orderRows = await rawQuery<OrderRow>(
    `INSERT INTO shop_orders (user_id, status, total_cents, shipping_address)
     VALUES ($1, 'confirmed', $2, $3)
     RETURNING id, user_id, status, total_cents, created_at`,
    [uid, totalCents, JSON.stringify(shippingAddress)],
  );
  const order = orderRows[0];

  for (const item of cartItems) {
    await rawQuery(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
       VALUES ($1, $2, $3, $4)`,
      [order.id, item.product_id, item.quantity, item.price_cents],
    );
  }

  await rawQuery("DELETE FROM cart_items WHERE user_id = $1", [uid]);
  res.status(201).json({ order });
});

/** GET /shop/orders — order history for the authenticated user */
shopRouter.get("/orders", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const q = req.query as Record<string, string | undefined>;
  const limit = Math.min(Number(q.limit) || 20, 100);
  const offset = Number(q.offset) || 0;

  const orders = await rawQuery<OrderRow>(
    `SELECT id, status, total_cents, created_at
     FROM shop_orders WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [uid, limit, offset],
  );
  res.json({ items: orders, limit, offset });
});

/** GET /shop/:id — single product detail */
shopRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const rows = await rawQuery<ProductRow>(
    `SELECT id, name, description, price_cents, currency, stock, category, images, metadata
     FROM shop_products WHERE id = $1 AND is_active = true`,
    [id],
  );
  if (!rows[0]) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(rows[0]);
});
