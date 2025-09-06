// app/api/diag/email/route.ts
import { NextResponse } from 'next/server';
import { verifySmtp, sendVerificationEmail } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function detectProvider() {
  if (process.env.MAILERSEND_API_TOKEN) return 'mailersend';
  if (process.env.RESEND_API_KEY)       return 'resend';
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  return 'unknown';
}

export async function GET() {
  const provider = detectProvider();
  const verify = await verifySmtp();
  return NextResponse.json({
    provider,
    from:
      process.env.MAILERSEND_FROM_EMAIL ||
      process.env.RESEND_FROM ||
      process.env.SMTP_FROM ||
      null,
    keySet: {
      MAILERSEND_API_TOKEN: !!process.env.MAILERSEND_API_TOKEN,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      SMTP_USER: !!process.env.SMTP_USER,
      SMTP_PASS: !!process.env.SMTP_PASS,
    },
    verify,
  });
}

export async function POST(req: Request) {
  // тестовая отправка
  const { to } = await req.json().catch(() => ({}));
  if (!to) return NextResponse.json({ ok: false, error: 'missing_to' }, { status: 400 });

  const base =
    process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`;
  const link = `${base}/_diag/email-test`;
  const sent = await sendVerificationEmail(to, link, 'signup');
  return NextResponse.json(sent, { status: sent.ok ? 200 : 500 });
}
