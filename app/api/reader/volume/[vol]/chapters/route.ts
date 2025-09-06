// app/api/reader/[mangaId]/volume/[vol]/chapters/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function columnExists(table: string, column: string) {
  const sql = `
    select 1
    from information_schema.columns
    where table_schema='public' and table_name=$1 and column_name=$2
    limit 1`;
  const { rowCount } = await query(sql, [table, column]);
  return (rowCount ?? 0) > 0;
}
const ident = (t: string) => (t === "chapters" ? t : `"${t}"`);

export async function GET(
  _req: Request,
  { params }: { params: { mangaId: string; vol: string } }
) {
  try {
    const mangaIdNum = Number(params.mangaId.match(/\d+/)?.[0] ?? params.mangaId);
    const volNum = Number(params.vol);
    if (![mangaIdNum, volNum].every(Number.isFinite)) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const T_CH = "chapters";
    const hasMangaIdBigint = await columnExists(T_CH, "manga_id_bigint");
    const hasMangaId = await columnExists(T_CH, "manga_id");
    const fkManga = hasMangaId ? "manga_id" : hasMangaIdBigint ? "manga_id_bigint" : "manga_id";

    const hasChNum = await columnExists(T_CH, "chapter_number");
    const hasChIdx = await columnExists(T_CH, "chapter_index");
    const hasVolIdx = await columnExists(T_CH, "volume_index");
    const hasVolNum = await columnExists(T_CH, "volume_number");

    const conds: string[] = [];
    const vals: any[] = [];

    conds.push(`c.${fkManga} = $${vals.length + 1}`); vals.push(mangaIdNum);

    const volCond: string[] = [];
    if (hasVolIdx) volCond.push(`c.volume_index  = $${vals.length + 1}`);
    if (hasVolNum) volCond.push(`c.volume_number = $${vals.length + 1}`);
    if (!volCond.length) volCond.push("true");
    vals.push(volNum);
    conds.push(`(${volCond.join(" OR ")})`);

    const selectNum = hasChNum ? "c.chapter_number" : hasChIdx ? "c.chapter_index" : "c.id";

    const sql = `
      select ${selectNum} as chapter
      from ${ident(T_CH)} c
      where ${conds.join(" AND ")}
      order by ${selectNum} asc`;

    const { rows } = await query(sql, vals);

    // items вида [{ chapter: "1" }, { chapter: "2" }, ...]
    return NextResponse.json({
      ok: true,
      items: rows.map((r: any) => ({ chapter: String(r.chapter) })),
    });
  } catch (e: any) {
    console.error("[api/reader/:mangaId/volume/:vol/chapters] error:", e);
    return NextResponse.json({ ok: false, items: [], error: e?.message ?? "error" }, { status: 500 });
  }
}
