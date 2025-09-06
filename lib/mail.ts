// lib/mail.ts
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';

type Ok = { ok: true; id?: string };
type Err = { ok: false; error: any };
type Result = Ok | Err;

// Провайдер: smtp | mailersend_api
const provider = (
  process.env.EMAIL_PROVIDER ||
  (process.env.MAILERSEND_API_TOKEN ? 'mailersend_api' : 'smtp')
).toLowerCase();

const MAIL_DEBUG =
  String(process.env.MAIL_DEBUG ?? '').toLowerCase() === 'true' ||
  process.env.MAIL_DEBUG === '1';

/* ================= SMTP ================= */

function smtpTransport() {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = String(process.env.SMTP_SECURE ?? 'false') === 'true'; // 465 -> true, 587/2525 -> false
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;

  const opts: SMTPTransport.Options = {
    host,
    port,
    secure,                 // 465 true; 587/2525 false (STARTTLS)
    auth: { user, pass },
    requireTLS: !secure,    // просим STARTTLS, если не secure
    authMethod: 'PLAIN',    // для MailerSend надёжнее PLAIN/LOGIN; используем PLAIN
    logger: MAIL_DEBUG,
    debug: MAIL_DEBUG,
    connectionTimeout: 20_000,
  };

  return nodemailer.createTransport(opts);
}

function smtpFrom() {
  // Если задан красивый From — берём его; иначе используем SMTP_USER
  return process.env.SMTP_FROM || process.env.SMTP_USER!;
}

/* ================= MailerSend API ================= */

const ms = process.env.MAILERSEND_API_TOKEN
  ? new MailerSend({ apiKey: process.env.MAILERSEND_API_TOKEN! })
  : null;

const msFromEmail = process.env.MAILERSEND_FROM_EMAIL || '';
const msFromName = process.env.MAILERSEND_FROM_NAME || 'MangaPulse';

/* ================= Public API ================= */

export async function verifySmtp(): Promise<Ok | Err> {
  if (provider === 'mailersend_api') return { ok: true };
  try {
    await smtpTransport().verify();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function sendVerificationEmail(
  to: string,
  link: string,
  mode: 'signup' | 'signin' = 'signup'
): Promise<Result> {
  const subject =
    mode === 'signup' ? 'Подтверждение регистрации' : 'Ссылка для входа';
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
      <h2>${subject}</h2>
      <p>Перейдите по ссылке для подтверждения:</p>
      <p><a href="${link}">${link}</a></p>
    </div>`;
  const text = `${subject}\n${link}`;

  // === MailerSend HTTP API ===
  if (provider === 'mailersend_api' && ms) {
    try {
      const params = new EmailParams()
        .setFrom(new Sender(msFromEmail, msFromName))
        .setTo([new Recipient(to, '')])
        .setSubject(subject)
        .setHtml(html)
        .setText(text);

      const res = await ms.email.send(params);
      return { ok: true, id: (res as any)?.messageId };
    } catch (e: any) {
      // Аккуратно вытащим детали из ответа SDK
      let details: any;
      try {
        if (e?.response?.json) details = await e.response.json();
        else if (e?.response?.text) {
          const t = await e.response.text();
          try { details = JSON.parse(t); } catch { details = t; }
        }
      } catch {}
      return {
        ok: false,
        error: {
          code: e?.name || e?.code || 'MAILERSEND_ERROR',
          message: e?.message,
          statusCode: e?.statusCode || e?.response?.status,
          details, // тут будут validation/allowed-recipients и т.п.
        },
      };
    }
  }

  // === SMTP ===
  try {
    const info = await smtpTransport().sendMail({
      from: smtpFrom(),
      to,
      subject,
      html,
      text,
    });
    return { ok: true, id: info.messageId };
  } catch (e: any) {
    // например: 535 Authentication failed
    return {
      ok: false,
      error: {
        code: e?.code || 'SMTP_ERROR',
        message: e?.message ?? String(e),
        response: e?.response,
      },
    };
  }
}
