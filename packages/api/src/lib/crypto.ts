import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex && hex.length === 64) return Buffer.from(hex, "hex");
  // deterministic dev fallback — never use in production
  return Buffer.alloc(32, 0);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("hex"),
    data: encrypted.toString("hex"),
    tag: tag.toString("hex"),
  });
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const { iv, data, tag } = JSON.parse(ciphertext) as { iv: string; data: string; tag: string };
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]);
  return dec.toString("utf8");
}
