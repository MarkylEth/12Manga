import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
type SqlFn = <T = Row>(q: TemplateStringsArray, ...vals: any[]) => Promise<T[]>;

async function getSql(): Promise<SqlFn | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const mod: any = await import("@neondatabase/serverless");
  const neon = mod?.neon || mod?.default?.neon;
  const raw = neon(url);
  const sql: SqlFn = async (q, ...vals) => {
    const res: any = await raw(q, ...vals);
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.rows)) return res.rows;
    const maybe = res?.results?.[0]?.rows;
    return Array.isArray(maybe) ? maybe : [];
  };
  return sql;
}

async function tableExists(sql: SqlFn, table: string) {
  const r = await sql/* sql */`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name=${table}
    LIMIT 1
  `;
  return r.length > 0;
}

export async function GET() {
  try {
    const sql = await getSql();
    if (!sql) return NextResponse.json({ ok: true, items: [] });

    if (!(await tableExists(sql, "mod_banned_patterns"))) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // pattern или fragment (на всякий случай оба варианта)
    const rows = await sql/* sql */`
      SELECT COALESCE(pattern, fragment) AS pattern
      FROM public.mod_banned_patterns
      WHERE COALESCE(disabled, false) = false
      ORDER BY 1
    `;

    const items = rows
      .map((r) => String(r?.pattern || "").trim())
      .filter(Boolean);

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    // при любой ошибке просто вернём пустой список, чтобы UI работал
    return NextResponse.json({ ok: true, items: [] });
  }
}
