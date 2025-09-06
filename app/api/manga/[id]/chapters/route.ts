// app/api/manga/[id]/chapters/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

async function hasColumn(table: string, col: string) {
  const { rowCount } = await query(
    `select 1
       from information_schema.columns
      where table_schema='public' and table_name=$1 and column_name=$2
      limit 1`,
    [table, col]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * GET /api/manga/:id/chapters
 * Параметры:
 * - limit=... (1..1000)
 * - order=asc|desc (по умолчанию desc)
 * - by=created_at|number (по умолчанию created_at)
 * - status=published|ready|draft|... или несколько через запятую
 * - all=1  → игнорировать фильтр по статусу (вернуть всё)
 *
 * ВАЖНО: по умолчанию (без ?all=1 и без ?status=...) — только published.
 */
export async function GET(req: Request, ctx: { params: { id: string } }) {
  try {
    const mangaId = Number(ctx.params?.id || 0);
    if (!mangaId) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get('limit') || 0);
    const limit = rawLimit ? Math.max(1, Math.min(1000, rawLimit)) : 0;
    const order = (url.searchParams.get('order') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const by = (url.searchParams.get('by') || 'created_at').toLowerCase();

    const all = url.searchParams.has('all');
    const statusParam = (url.searchParams.get('status') || url.searchParams.get('statuses') || '').trim();
    const statuses = statusParam
      ? statusParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : null;

    const orderBy =
      by === 'number'
        ? `coalesce(chapter_number,0) ${order}, created_at desc`
        : `created_at ${order}, coalesce(chapter_number,0) desc`;

    const params: any[] = [mangaId];
    const where: string[] = [`manga_id = $1`];

    const hasStatus = await hasColumn('chapters', 'status');

    if (hasStatus) {
      let effectiveStatuses: string[] | null = null;
      if (statuses && statuses.length) effectiveStatuses = statuses;
      else if (!all) effectiveStatuses = ['published']; // <— поведение по умолчанию

      if (effectiveStatuses) {
        params.push(effectiveStatuses);
        where.push(`lower(status) = any($${params.length}::text[])`);
      }
    }

    let sql =
      `select id, manga_id,
              coalesce(chapter_number,0) as chapter_number,
              coalesce(volume,0) as volume,
              coalesce(title,'') as title,
              status, pages_count, created_at, updated_at
         from chapters
        where ${where.join(' and ')}
        order by ${orderBy}`;

    if (limit) {
      params.push(limit);
      sql += ` limit $${params.length}`;
    }

    const { rows } = await query(sql, params);
    return NextResponse.json({ ok: true, items: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: String(e?.message || e) }, { status: 500 });
  }
}
