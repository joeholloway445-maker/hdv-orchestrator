import nodemailer from "nodemailer";
import { interpolate as _interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  const result = _interpolate(template, data as Record<string, unknown>);
  return result !== undefined && result !== null ? String(result) : "";
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
