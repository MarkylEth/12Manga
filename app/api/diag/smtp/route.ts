// app/api/diag/smtp/route.ts
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { verifySmtp, mailerInfo, sendVerificationEmail } from '@/lib/mail';

export async function GET() {
  const info = mailerInfo();
  const verify = await verifySmtp();
  return NextResponse.json({
    provider: info.provider,
    env: info.provider === 'smtp'
      ? { host: (info as any).host, port: (info as any).port, secure: (info as any).secure }
      : { from: process.env.RESEND_FROM || process.env.SMTP_FROM },
    verify,
    keySet: {
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      SMTP_USER: !!process.env.SMTP_USER,
      SMTP_PASS: !!process.env.SMTP_PASS,
    },
  });
}

export async function POST() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3008}`;
  const link = `${base}/dummy`;
  const to = process.env.SMTP_USER || process.env.RESEND_TO || 'test@example.com';
  const sent = await sendVerificationEmail(to, link, 'signup');
  return NextResponse.json(sent, { status: sent.ok ? 200 : 500 });
}
