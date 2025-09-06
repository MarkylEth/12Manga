// app/api/title-submissions/list/route.ts
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || 'pending').toLowerCase(); // pending|approved|rejected|all
    const q = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const useAll = status === 'all';
    const params: any[] = [];
    let where: string[] = [];

    if (!useAll) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(author_name ILIKE $${params.length} OR (payload->>'title_ru') ILIKE $${params.length} OR (payload->>'title_romaji') ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    params.push(limit);
    const limIdx = params.length;
    params.push(offset);
    const offIdx = params.length;

    const sql = `
      SELECT *
      FROM title_submissions
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${limIdx}
      OFFSET $${offIdx}
    `;
    const { rows } = await query(sql, params);

    return Response.json({ ok: true, items: rows, limit, offset });
  } catch (e: any) {
    console.error(e);
    return Response.json({ ok: false, error: e?.message ?? 'list_failed' }, { status: 500 });
  }
}
