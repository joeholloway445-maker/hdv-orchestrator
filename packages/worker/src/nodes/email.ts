import nodemailer from "nodemailer";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, key: string) => {
    const val = key
      .trim()
      .split(".")
      .reduce(
        (obj: unknown, k: string) => (obj && typeof obj === "object" ? (obj as Record<string, unknown>)[k] : undefined),
        data,
      );
    return val !== undefined ? String(val) : "";
  });
}

export async function executeEmail(node: NodeDef, $input: Record<string, unknown>): Promise<unknown> {
  const { smtpHost, smtpPort, smtpUser, smtpPass, from, to, subject, body } = node.data as {
    smtpHost?: string;
    smtpPort?: string;
    smtpUser?: string;
    smtpPass?: string;
    from?: string;
    to?: string;
    subject?: string;
    body?: string;
  };

  const transporter = nodemailer.createTransport({
    host: smtpHost || "localhost",
    port: parseInt(smtpPort || "587", 10),
    secure: parseInt(smtpPort || "587", 10) === 465,
    auth: smtpUser ? { user: smtpUser, pass: smtpPass || "" } : undefined,
  });

  const info = await transporter.sendMail({
    from: from || smtpUser,
    to: interpolate(to || "", $input),
    subject: interpolate(subject || "", $input),
    text: interpolate(body || "", $input),
  });

  return { ...$input, emailSent: true, emailMessageId: info.messageId };
}
