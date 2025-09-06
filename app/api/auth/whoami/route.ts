import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

function jserr(e: any, status = 500) {
  return NextResponse.json(
    {
      ok: false,
      error: 'internal_error',
      message: e?.message ?? String(e),
      code: e?.code,
      detail: e?.detail,
      where: e?.where,
    },
    { status }
  );
}

export async function GET() {
  try {
    const allCookies = cookies().getAll().map(c => ({ name: c.name }));
    const token = cookies().get(SESSION_COOKIE)?.value; // mp_session
    const payload = await verifySession(token);

    if (!payload?.sub) {
      return NextResponse.json(
        { ok: false, error: 'unauthorized', cookiePresent: !!token, cookies: allCookies },
        { status: 401 }
      );
    }

    const uid = String(payload.sub);

    // 1) пробуем users.nickname
    try {
      const { rows } = await query<{ id: string; email: string; nickname: string | null; created_at: string }>(
        `select id, email, nickname, created_at from users where id = $1 limit 1`,
        [uid]
      );
      return NextResponse.json({ ok: true, payload, user: rows[0] ?? null, cookies: allCookies });
    } catch (e: any) {
      if (e?.code !== '42703') throw e;
    }

    // 2) fallback: users.name как nickname
    const { rows } = await query<{ id: string; email: string; nickname: string | null; created_at: string }>(
      `select id, email, name as nickname, created_at from users where id = $1 limit 1`,
      [uid]
    );
    return NextResponse.json({ ok: true, payload, user: rows[0] ?? null, cookies: allCookies });
  } catch (e: any) {
    return jserr(e);
  }
}
