// app/api/users/lookup/route.ts
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const me = await getAuthUser();
    if (!me?.id) {
      return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const idsParam = (url.searchParams.get('ids') || '').trim();
    if (!idsParam) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ ok: true, items: [] });

    // подготавливаем плейсхолдеры $1,$2,... и массив значений
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const r = await query(
      `SELECT id, full_name, username, avatar_url
       FROM profiles
       WHERE id IN (${placeholders})`,
      ids
    );

    return NextResponse.json({
      ok: true,
      items: r.rows.map(row => ({
        id: row.id,
        full_name: row.full_name,
        username: row.username,
        avatar_url: row.avatar_url,
      })),
    });
  } catch (e) {
    console.error('[GET /api/users/lookup] error:', e);
    return NextResponse.json({ ok: false, message: 'server error' }, { status: 500 });
  }
}
