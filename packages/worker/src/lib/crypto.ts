import crypto from "crypto";

const ALGO = "aes-256-gcm";

const KEY: Buffer = (() => {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("ENCRYPTION_KEY must be set to exactly 64 hex characters");
  }
  return Buffer.from(hex, "hex");
})();

export function decrypt(ciphertext: string): string {
  const { iv, data, tag } = JSON.parse(ciphertext) as { iv: string; data: string; tag: string };
  const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return decipher.update(data, "hex", "utf8") + decipher.final("utf8");
}
