import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THRESHOLD = 10;

async function getSql() {
  const url = process.env.DATABASE_URL!;
  const mod = await import("@neondatabase/serverless").catch(() => null as any);
  return url && mod?.neon ? mod.neon(url) : null;
}

async function getUserOrThrow(req: Request) {
  const u = new URL(req.url);
  const r = await fetch(new URL("/api/me", u.origin), {
    headers: { cookie: req.headers.get("cookie") ?? "" },
    cache: "no-store",
  });
  const me = await r.json().catch(() => null);
  if (!r.ok || !me?.id) throw new Error("Unauthorized");
  return me as { id: string };
}

export async function POST(req: Request, ctx: { params: { id: string; commentId: string } }) {
  try {
    const sql = await getSql();
    if (!sql) return NextResponse.json({ ok: false, message: "DB not configured" }, { status: 500 });

    const { commentId } = ctx.params;
    const user = await getUserOrThrow(req);

    const rows = await sql/* sql */`
      WITH ins AS (
        INSERT INTO public.comment_reports(source, comment_id, user_id)
        VALUES ('page', ${commentId}::bigint, ${user.id}::uuid)
        ON CONFLICT DO NOTHING
        RETURNING 1
      ),
      upd AS (
        UPDATE public.page_comments c
           SET reports_count = c.reports_count + COALESCE((SELECT COUNT(*) FROM ins), 0),
               is_hidden     = CASE
                                 WHEN c.reports_count + COALESCE((SELECT COUNT(*) FROM ins),0) >= ${THRESHOLD}
                                 THEN true ELSE c.is_hidden END
         WHERE c.id = ${commentId}::bigint
       RETURNING c.id, c.reports_count, c.is_hidden
      )
      SELECT * FROM upd;
    `;
    const row = rows?.[0] ?? null;
    if (!row) return NextResponse.json({ ok: false, message: "Комментарий не найден" }, { status: 404 });

    return NextResponse.json({
      ok: true,
      item: { id: String(row.id), reports_count: Number(row.reports_count || 0), is_hidden: !!row.is_hidden },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: String(e?.message || e) }, { status: 500 });
  }
}
