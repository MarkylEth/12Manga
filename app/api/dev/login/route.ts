import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';

function randToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function sha256(x: string) {
  return crypto.createHash('sha256').update(x).digest('hex');
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  const name  = req.nextUrl.searchParams.get('name');
  if (!email) return NextResponse.json({ ok: false, error: 'email_required' }, { status: 400 });

  // 1) гарантируем пользователя (предполагается UNIQUE(email))
  const u = await query<{ id: string; email: string; nickname: string | null }>(
    `
    insert into users (email, nickname)
    values ($1, $2)
    on conflict (email) do update
      set nickname = coalesce(excluded.nickname, users.nickname)
    returning id, email, nickname
    `,
    [email, name ?? null]
  );
  const user = u.rows[0];

  // 2) создаём сессию
  const raw = randToken();
  const hash = sha256(raw);
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30); // 30 дней

  const ua = req.headers.get('user-agent') ?? null;
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') || null;

  await query(
    `
    insert into sessions (token_hash, user_id, user_agent, ip, created_at, last_used_at, expires_at)
    values ($1, $2, $3, $4, now(), now(), $5)
    on conflict (token_hash) do nothing
    `,
    [hash, user.id, ua, ip, expires.toISOString()]
  );

  // 3) ставим cookie с СЫРЫМ токеном
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set('session', raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // ты на http://IP:3008 — в проде на HTTPS переключи на true
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
