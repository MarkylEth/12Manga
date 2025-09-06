// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { query } from '@/lib/db';
import { verifyPassword } from '@/lib/hash';
import { signSession } from '@/lib/auth/session';

function isSecureReq(req: NextRequest) {
  // если за прокси — берём заголовок
  const xf = req.headers.get('x-forwarded-proto');
  if (xf) return xf.includes('https');
  return process.env.NODE_ENV === 'production';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'missing_credentials' }, { status: 400 });
    }

    const r = await query<{
      id: string;
      password_hash: string | null;
      name: string | null;
      email_verified_at: string | null;
    }>(
      `SELECT id, password_hash, name, email_verified_at
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    const u = r.rows[0];

    if (!u || !u.password_hash) {
      return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
    }

    const ok = await verifyPassword(password, u.password_hash);
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
    }

    const token = await signSession({ sub: u.id, email, name: u.name ?? null });

    const res = NextResponse.json({ ok: true, user: { id: u.id, email, name: u.name } });
    res.cookies.set(process.env.SESSION_NAME || 'mp_session', token, {
      httpOnly: true,
      secure: isSecureReq(req),   // <-- ВАЖНО: только https/прод
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,  // 30 дней
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'internal', message: e?.message }, { status: 500 });
  }
}
