import { createHash, createHmac, randomUUID } from "crypto";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, key: string) => {
    const val = key
      .trim()
      .split(".")
      .reduce((obj: unknown, k: string) => (obj && typeof obj === "object" ? (obj as Record<string, unknown>)[k] : undefined), data);
    return val !== undefined ? String(val) : "";
  });
}

export function executeCrypto(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const operation = String(node.data?.operation || "sha256");
  const outputField = String(node.data?.outputField || "result");
  const encoding = (String(node.data?.encoding || "hex")) as "hex" | "base64";

  const rawInput = node.data?.inputField ? interpolate(String(node.data.inputField), $input) : "";
  const secretKey = node.data?.secretKey ? interpolate(String(node.data.secretKey), $input) : "";

  let result: string;

  switch (operation) {
    case "md5":
      result = createHash("md5").update(rawInput).digest(encoding);
      break;
    case "sha1":
      result = createHash("sha1").update(rawInput).digest(encoding);
      break;
    case "sha256":
      result = createHash("sha256").update(rawInput).digest(encoding);
      break;
    case "sha512":
      result = createHash("sha512").update(rawInput).digest(encoding);
      break;
    case "hmac_sha256":
      result = createHmac("sha256", secretKey).update(rawInput).digest(encoding);
      break;
    case "hmac_sha512":
      result = createHmac("sha512", secretKey).update(rawInput).digest(encoding);
      break;
    case "base64encode":
      result = Buffer.from(rawInput, "utf8").toString("base64");
      break;
    case "base64decode":
      result = Buffer.from(rawInput, "base64").toString("utf8");
      break;
    case "urlencode":
      result = encodeURIComponent(rawInput);
      break;
    case "urldecode":
      result = decodeURIComponent(rawInput);
      break;
    case "uuid":
      result = randomUUID();
      break;
    default:
      result = createHash("sha256").update(rawInput).digest("hex");
  }

  return { ...$input, [outputField]: result };
}
