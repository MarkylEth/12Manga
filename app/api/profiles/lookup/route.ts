import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    ids = [...new Set(ids.filter(Boolean))].slice(0, 100); // дедуп и ограничение

    if (ids.length === 0) return NextResponse.json({ ok: true, items: [] });

    const { rows } = await query(
      `SELECT id, username, full_name, avatar_url
       FROM profiles
       WHERE id = ANY($1::uuid[])`,
      [ids]
    );

    // вернем map для удобства
    return NextResponse.json({ ok: true, items: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || 'lookup_failed' }, { status: 500 });
  }
}
