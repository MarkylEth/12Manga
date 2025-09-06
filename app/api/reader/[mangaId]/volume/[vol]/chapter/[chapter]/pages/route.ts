import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Проверка присутствия колонки в схеме
async function columnExists(table: string, column: string) {
  const sql = `
    select 1
    from information_schema.columns
    where table_schema='public' and table_name=$1 and column_name=$2
    limit 1`;
  const { rowCount } = await query(sql, [table, column]);
  return (rowCount ?? 0) > 0;
}
const ident = (t: string) => (t === "chapter_pages" || t === "chapters" ? t : `"${t}"`);

export async function GET(
  _req: Request,
  { params }: { params: { mangaId: string; vol: string; chapter: string } }
) {
  try {
    // из "6-yakutia" берём число 6 (если его нет — берём как есть)
    const mangaIdNum = Number(params.mangaId.match(/\d+/)?.[0] ?? params.mangaId);
    const volNum     = Number(params.vol);
    const chNum      = Number(params.chapter);

    if (![mangaIdNum, volNum, chNum].every(Number.isFinite)) {
      return NextResponse.json({ ok: true, items: [], pages: [] });
    }

    const T_CH = "chapters";
    const T_PG = "chapter_pages";

    // какие колонки есть сейчас
    const hasMangaIdBigint = await columnExists(T_CH, "manga_id_bigint");
    const hasMangaId       = await columnExists(T_CH, "manga_id");
    const fkManga = hasMangaId ? "manga_id" : (hasMangaIdBigint ? "manga_id_bigint" : "manga_id");

    const hasChNum   = await columnExists(T_CH, "chapter_number");
    const hasChIdx   = await columnExists(T_CH, "chapter_index");
    const hasVolIdx  = await columnExists(T_CH, "volume_index");
    const hasVolNum  = await columnExists(T_CH, "volume_number");

    const hasPgIndex   = await columnExists(T_PG, "page_index");
    const hasPgNumber  = await columnExists(T_PG, "page_number");
    const hasImgUrl    = await columnExists(T_PG, "image_url");
    const hasUrl       = await columnExists(T_PG, "url");
    const hasPath      = await columnExists(T_PG, "path");
    const hasPgVolIdx  = await columnExists(T_PG, "volume_index");

    // найти id главы по (манга, том, глава)
    const conditions: string[] = [];
    const values: any[] = [];

    // manga
    conditions.push(`c.${fkManga} = $${values.length + 1}`);
    values.push(mangaIdNum);

    // chapter (number/index)
    const chCond: string[] = [];
    if (hasChNum) chCond.push(`c.chapter_number = $${values.length + 1}`);
    if (hasChIdx) chCond.push(`c.chapter_index  = $${values.length + 1}`);
    if (chCond.length === 0) chCond.push(`c.id is not null`);
    values.push(chNum);
    conditions.push(`(${chCond.join(" OR ")})`);

    // volume (index/number)
    const volCond: string[] = [];
    if (hasVolIdx) volCond.push(`c.volume_index  = $${values.length + 1}`);
    if (hasVolNum) volCond.push(`c.volume_number = $${values.length + 1}`);
    if (volCond.length === 0) volCond.push(`true`);
    values.push(volNum);
    conditions.push(`(${volCond.join(" OR ")})`);

    const sqlFindChapter = `
      select c.id
      from ${ident(T_CH)} c
      where ${conditions.join(" AND ")}
      order by
        ${hasVolIdx ? "c.volume_index" : hasVolNum ? "c.volume_number" : "c.id"},
        ${hasChIdx ? "c.chapter_index" : hasChNum ? "c.chapter_number" : "c.id"}
      limit 1`;

    const chRes = await query(sqlFindChapter, values);
    const chapterId: number | null = chRes.rows?.[0]?.id ?? null;

    if (!chapterId) {
      // глава не найдена — отдаём пусто (страница не падает)
      return NextResponse.json({ ok: true, items: [], pages: [] });
    }

    // страницы
    const pageIndexExpr = hasPgIndex
      ? "p.page_index::int"
      : hasPgNumber
      ? "p.page_number::int"
      : `row_number() over (partition by p.chapter_id order by p.created_at, p.id)::int`;

    const imageExpr = hasImgUrl ? "p.image_url"
      : hasUrl ? "p.url"
      : hasPath ? "p.path"
      : "NULL::text";

    const sqlPages = `
      select
        p.id,
        p.chapter_id,
        ${pageIndexExpr} as page_index,
        ${imageExpr}     as image_url,
        ${hasPgVolIdx ? "p.volume_index::int" : "NULL::int"} as volume_index
      from ${ident(T_PG)} p
      where p.chapter_id = $1
      order by page_index, p.id`;

    const { rows } = await query(sqlPages, [chapterId]);

    const items = rows.map((r: any) => ({
      id: Number(r.id),
      chapter_id: Number(r.chapter_id),
      index: Number(r.page_index),
      url: r.image_url ?? null,
      volume_index: r.volume_index == null ? null : Number(r.volume_index),
    }));

    return NextResponse.json({ ok: true, items, pages: items });
  } catch (e: any) {
    console.error("[api reader pages] error:", e);
    return NextResponse.json({ ok: false, items: [], error: e?.message ?? "error" }, { status: 500 });
  }
}
