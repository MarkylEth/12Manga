import { NextResponse } from 'next/server';
import { sendVerificationEmail } from '@/lib/mail';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = url.searchParams.get('to') || process.env.SMTP_USER || '';
  if (!to) return NextResponse.json({ ok: false, error: 'no_to' }, { status: 400 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const link = `${origin}/api/auth/verify?token=TEST`;

  try {
    await sendVerificationEmail(to, link, 'signup');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
