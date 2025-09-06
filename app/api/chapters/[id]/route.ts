import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// проверки схемы
async function columnExists(table: string, column: string) {
  const { rowCount } = await query(
    `select 1 from information_schema.columns
     where table_schema='public' and table_name=$1 and column_name=$2 limit 1`,
    [table, column]
  );
  return (rowCount ?? 0) > 0;
}
async function tableExists(name: string) {
  const { rowCount } = await query(
    `select 1 from information_schema.tables
     where table_schema='public' and table_name=$1 limit 1`,
    [name]
  );
  return (rowCount ?? 0) > 0;
}
const Q = (t: string) => (t === 'chapters' ? t : `"${t}"`);
const toIntExpr = (col: string) =>
  `nullif(regexp_replace(${col}::text, '\\D', '', 'g'), '')::int`;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: 'bad id' }, { status: 400 });
    }

    // поддержка англ/рус таблицы
    const T = (await tableExists('chapters')) ? 'chapters' : (await tableExists('главы')) ? 'главы' : null;
    if (!T) return NextResponse.json({ ok: false, error: 'chapters table not found' }, { status: 500 });

    // собираем выражения только по существующим колонкам
    const mCandidates = ['manga_id', 'title_id'];
    const vCandidates = ['volume_index', 'volume_number', 'vol_number', 'volume'];
    const cCandidates = ['chapter_index', 'chapter_number', 'chapter'];

    const mExprParts: string[] = [];
    for (const c of mCandidates) if (await columnExists(T, c)) mExprParts.push(toIntExpr(`c.${c}`));
    const vExprParts: string[] = [];
    for (const c of vCandidates) if (await columnExists(T, c)) vExprParts.push(toIntExpr(`c.${c}`));
    const chExprParts: string[] = [];
    for (const c of cCandidates) if (await columnExists(T, c)) chExprParts.push(toIntExpr(`c.${c}`));

    // если чего-то нет, пусть вернётся null
    const mExpr = mExprParts.length ? `coalesce(${mExprParts.join(',')})` : 'null::int';
    const vExpr = vExprParts.length ? `coalesce(${vExprParts.join(',')})` : 'null::int';
    const chExpr = chExprParts.length ? `coalesce(${chExprParts.join(',')})` : 'null::int';

    const sql = `
      select
        c.id,
        ${mExpr}  as manga_id,
        ${vExpr}  as volume_index,
        ${chExpr} as chapter_number
      from ${Q(T)} c
      where c.id = $1
      limit 1
    `;
    const { rows } = await query(sql, [id]);
    const row = rows?.[0];
    if (!row) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

    const item = {
      id: Number(row.id),
      manga_id: row.manga_id == null ? null : Number(row.manga_id),
      volume_index: row.volume_index == null ? null : Number(row.volume_index),
      chapter_number: row.chapter_number == null ? null : Number(row.chapter_number),
    };
    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    console.error('[api/chapters/:id] error:', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'error' }, { status: 500 });
  }
}
