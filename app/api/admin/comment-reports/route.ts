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

export async function GET(req: Request) {
  try {
    const sql = await getSql();
    if (!sql) return NextResponse.json({ ok:false, items:[], total:0, hint:"DB not configured" });

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get("status") || "open").toLowerCase(); // open|accepted|rejected
    const limit  = Math.max(1, Math.min(200, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    const items = await sql/* sql */`
      WITH base AS (
        SELECT r.*,
               CASE r.source
                 WHEN 'manga' THEN (SELECT coalesce(mc.content, mc.comment, mc.body, '') FROM public.manga_comments mc WHERE mc.id = r.comment_id)
                 WHEN 'page'  THEN (SELECT coalesce(pc.content, pc.comment, pc.body, '') FROM public.page_comments  pc WHERE pc.id = r.comment_id)
               END AS comment_text,
               CASE r.source
                 WHEN 'manga' THEN (SELECT mc.user_id FROM public.manga_comments mc WHERE mc.id = r.comment_id)
                 WHEN 'page'  THEN (SELECT pc.user_id FROM public.page_comments  pc WHERE pc.id = r.comment_id)
               END AS comment_user_id,
               CASE r.source
                 WHEN 'manga' THEN (SELECT coalesce(mc.reports_count,0) FROM public.manga_comments mc WHERE mc.id = r.comment_id)
                 WHEN 'page'  THEN (SELECT coalesce(pc.reports_count,0) FROM public.page_comments  pc WHERE pc.id = r.comment_id)
               END AS reports_count,
               CASE r.source
                 WHEN 'manga' THEN (SELECT coalesce(mc.is_hidden,false) FROM public.manga_comments mc WHERE mc.id = r.comment_id)
                 WHEN 'page'  THEN (SELECT coalesce(pc.is_hidden,false) FROM public.page_comments  pc WHERE pc.id = r.comment_id)
               END AS is_hidden
        FROM public.comment_reports r
        WHERE (${status} = '' OR r.status = ${status})
      )
      SELECT * FROM base
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ total }] = await sql<{ total: string }>`
      SELECT COUNT(*)::int AS total
      FROM public.comment_reports
      WHERE (${status} = '' OR status = ${status})
    `;

    return NextResponse.json({ ok:true, items, total: Number(total) });
  } catch (e: any) {
    return NextResponse.json({ ok:false, message:e?.message || "server error" }, { status:500 });
  }
}
