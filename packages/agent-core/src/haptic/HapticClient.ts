import { HapticCommand } from "../core/types";

const HAPTIC_API_URL = process.env.HAPTIC_API_URL ?? "";

export class HapticClient {
  async send(cmd: HapticCommand): Promise<{ ok: boolean; message: string }> {
    if (!HAPTIC_API_URL) {
      console.log(`[HapticClient] Dry-run — no HAPTIC_API_URL set. Would send:`, cmd);
      return { ok: true, message: "dry-run" };
    }

    try {
      const res = await fetch(HAPTIC_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
        signal: AbortSignal.timeout(5000),
      });
      const ok = res.ok;
      return { ok, message: ok ? "sent" : `HTTP ${res.status}` };
    } catch (err) {
      console.warn("[HapticClient] Send failed:", err);
      return { ok: false, message: String(err) };
    }
  }

  async ping(): Promise<boolean> {
    if (!HAPTIC_API_URL) return false;
    try {
      const res = await fetch(`${HAPTIC_API_URL}/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
