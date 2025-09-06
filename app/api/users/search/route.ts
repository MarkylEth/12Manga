import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const me = await getAuthUser().catch(() => null) as any;
    const meId = me?.id || me?.user?.id || null;

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 50);

    // поиск по full_name и по части uuid (to_char/::text)
    const sql = q
      ? `
        SELECT id, full_name, avatar_url
          FROM profiles
         WHERE ($1 = '' OR full_name ILIKE '%' || $1 || '%' OR id::text ILIKE '%' || $1 || '%')
           AND ($2::uuid IS NULL OR id <> $2::uuid)
         ORDER BY full_name NULLS LAST, id ASC
         LIMIT $3
      `
      : `
        SELECT id, full_name, avatar_url
          FROM profiles
         WHERE ($1::uuid IS NULL OR id <> $1::uuid)
         ORDER BY full_name NULLS LAST, id ASC
         LIMIT $2
      `;
    const params = q ? [q, meId, limit] : [meId, limit];

    const { rows } = await query(sql, params);
    return NextResponse.json({ ok: true, items: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || 'search_failed' }, { status: 500 });
  }
}
