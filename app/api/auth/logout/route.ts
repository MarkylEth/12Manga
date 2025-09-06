import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function deleteSessionFromDB(token: string) {
  // если есть таблица sessions с token_hash — инвалидируем
  try {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  } catch (e: any) {
    // 42P01 — таблицы нет, просто игнорируем
    if (e?.code !== '42P01') throw e;
  }
}

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });

  // имена возможных cookie сессии в проекте
  const names = ['mp_session', 'session', 'sess', 'auth_token', 'sb-access-token', 'sb-refresh-token'];

  let rawToken: string | null = null;
  for (const name of names) {
    const val = req.cookies.get(name)?.value ?? null;
    if (!rawToken && val && ['mp_session','session','sess','auth_token'].includes(name)) {
      rawToken = val;
    }
    // гасим cookie
    res.cookies.set({
      name,
      value: '',
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      expires: new Date(0),
    });
  }

  if (rawToken) await deleteSessionFromDB(rawToken);

  return res;
}

export async function GET(req: NextRequest) {
  return POST(req); // на всякий случай поддержим GET
}
