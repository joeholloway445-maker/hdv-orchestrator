import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex && hex.length === 64) return Buffer.from(hex, "hex");
  return Buffer.alloc(32, 0);
}

export function decrypt(ciphertext: string): string {
  const { iv, data, tag } = JSON.parse(ciphertext) as { iv: string; data: string; tag: string };
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return decipher.update(data, "hex", "utf8") + decipher.final("utf8");
}
