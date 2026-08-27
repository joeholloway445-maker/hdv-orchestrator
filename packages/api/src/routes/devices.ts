/**
 * Device-binding routes — ported from Sea-Scyte apps/api/src/routes/devices.ts
 *
 * Lets authenticated users pair physical Hub devices to their account.
 * All routes require auth (wired via verifyToken in index.ts).
 */
import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { rawQuery } from "../lib/rawQuery";

export const devicesRouter = Router();

interface DeviceRow {
  id: string;
  device_id: string;
  label: string | null;
  is_revoked: boolean;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** GET /devices — list all bound devices for the authenticated user */
devicesRouter.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const devices = await rawQuery<DeviceRow>(
    `SELECT id, device_id, label, is_revoked, last_used_at, created_at, revoked_at
     FROM device_bindings
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [uid],
  );
  res.json({ devices });
});

/** POST /devices/pair — pair a new Hub device (or un-revoke a previously revoked one) */
devicesRouter.post("/pair", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { deviceId, publicKey, label } = req.body as {
    deviceId?: unknown;
    publicKey?: string;
    label?: string;
  };

  if (typeof deviceId !== "string" || !deviceId) {
    res.status(400).json({ error: "deviceId must be a non-empty string" });
    return;
  }

  const existing = await rawQuery<{ id: string; user_id: string; is_revoked: boolean }>(
    "SELECT id, user_id, is_revoked FROM device_bindings WHERE device_id = $1",
    [deviceId],
  );
  const record = existing[0];

  if (record && !record.is_revoked) {
    if (record.user_id === uid) {
      res.status(409).json({ error: "Device already paired to your account" });
    } else {
      res.status(409).json({ error: "Device already paired to another account" });
    }
    return;
  }

  // Un-revoke if previously revoked by the same user
  if (record && record.is_revoked && record.user_id === uid) {
    const updated = await rawQuery<DeviceRow>(
      `UPDATE device_bindings
       SET is_revoked = false, revoked_at = null, public_key = $1, label = $2, last_used_at = now()
       WHERE id = $3
       RETURNING id, device_id, label, is_revoked, last_used_at, created_at`,
      [publicKey ?? null, label ?? null, record.id],
    );
    res.status(200).json({ device: updated[0], restored: true });
    return;
  }

  const created = await rawQuery<DeviceRow>(
    `INSERT INTO device_bindings (user_id, device_id, public_key, label)
     VALUES ($1, $2, $3, $4)
     RETURNING id, device_id, label, is_revoked, last_used_at, created_at`,
    [uid, deviceId, publicKey ?? null, label ?? null],
  );
  res.status(201).json({ device: created[0] });
});

/** DELETE /devices/:id — revoke a paired device */
devicesRouter.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.userId;
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params;
  const rows = await rawQuery<{ id: string }>(
    "SELECT id FROM device_bindings WHERE id = $1 AND user_id = $2",
    [id, uid],
  );
  if (!rows[0]) { res.status(404).json({ error: "Device not found" }); return; }

  await rawQuery(
    "UPDATE device_bindings SET is_revoked = true, revoked_at = now() WHERE id = $1",
    [id],
  );
  res.json({ revoked: true });
});
