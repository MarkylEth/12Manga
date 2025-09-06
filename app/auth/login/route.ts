// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyPassword } from '@/lib/hash';
import { signSession, setSessionCookie } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (!email || !password)
      return NextResponse.json({ ok: false, error: 'missing_credentials' }, { status: 400 });

    const { rows } = await query<{
      id: string; password_hash: string | null; name: string | null; role: string | null;
    }>(
      `select id::text as id, password_hash, name, role
       from users where email=$1 limit 1`, [email]
    );
    const u = rows[0];
    if (!u?.password_hash)
      return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });

    const ok = await verifyPassword(password, u.password_hash);
    if (!ok)
      return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });

    const token = await signSession({
      sub: u.id, email, name: u.name ?? null, role: (u.role as any) ?? 'user',
    });

    await setSessionCookie(token);

    return NextResponse.json({ ok: true, user: { id: u.id, email, name: u.name, role: u.role ?? 'user' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'internal', message: e?.message }, { status: 500 });
  }
}
