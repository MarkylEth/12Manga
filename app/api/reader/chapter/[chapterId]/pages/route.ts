import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function columnExists(table: string, column: string) {
  const sql = `
    select 1
    from information_schema.columns
    where table_schema='public' and table_name=$1 and column_name=$2
    limit 1`;
  const { rowCount } = await query(sql, [table, column]);
  return (rowCount ?? 0) > 0;
}

const ident = (t: string) => (t === 'chapter_pages' ? t : `"${t}"`);

export async function GET(
  _req: Request,
  { params }: { params: { chapterId: string } }
) {
  try {
    const chapterId = Number(params.chapterId);
    if (!Number.isFinite(chapterId)) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Таблица страниц: eng -> ru
    const T_PG = (await columnExists('chapter_pages', 'id'))
      ? 'chapter_pages'
      : 'страницы_глав';

    // Имя FK на главу
    const fk = (await columnExists(T_PG, 'chapter_id'))
      ? 'chapter_id'
      : (await columnExists(T_PG, 'chapter_id_bigint'))
      ? 'chapter_id_bigint'
      : 'chapter_id';

    // Наличие колонок
    const hasPageIndex  = await columnExists(T_PG, 'page_index');
    const hasPageNumber = await columnExists(T_PG, 'page_number');
    const hasImageUrl   = await columnExists(T_PG, 'image_url');
    const hasUrl        = await columnExists(T_PG, 'url');
    const hasPath       = await columnExists(T_PG, 'path');
    const hasVolIdxPg   = await columnExists(T_PG, 'volume_index');

    // Выражения
    const pageIndexExpr = hasPageIndex
      ? 'p.page_index::int'
      : hasPageNumber
      ? 'p.page_number::int'
      : `row_number() over (partition by p.${fk} order by p.created_at, p.id)::int`;

    const imageExpr = hasImageUrl
      ? 'p.image_url'
      : hasUrl
      ? 'p.url'
      : hasPath
      ? 'p.path'
      : 'NULL::text';

    // Том: из p.volume_index, либо из chapters налёту
    const volExpr = hasVolIdxPg
      ? 'p.volume_index::int'
      : `(select coalesce(c.volume_index, c.volume_number, c.vol_number,
           nullif(regexp_replace(c.volume::text,'\\D','','g'),'')::int)
         from chapters c where c.id = p.${fk})::int`;

    const sql = `
      select
        p.id,
        p.${fk} as chapter_id,
        ${pageIndexExpr} as page_index,
        ${imageExpr}     as image_url,
        ${volExpr}       as volume_index
      from ${ident(T_PG)} p
      where p.${fk} = $1
      order by page_index, p.id
    `;

    const { rows } = await query(sql, [chapterId]);

    const items = rows.map((r: any) => ({
      id: Number(r.id),
      chapter_id: Number(r.chapter_id),
      page_index: r.page_index == null ? null : Number(r.page_index),
      image_url: r.image_url ?? null,
      volume_index: r.volume_index == null ? null : Number(r.volume_index),
    }));

    return NextResponse.json({ ok: true, items, pages: items });
  } catch (e: any) {
    console.error('[api/reader/chapter/:id/pages] error:', e);
    return NextResponse.json({ ok: true, items: [], error: e?.message });
  }
}
