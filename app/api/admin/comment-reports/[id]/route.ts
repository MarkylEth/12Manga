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

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const sql = await getSql();
    if (!sql) return NextResponse.json({ ok:false, message:"DB not configured" }, { status:500 });

    const reportId = Number(ctx.params.id || 0);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      return NextResponse.json({ ok:false, message:"bad id" }, { status:400 });
    }

    const body = await req.json().catch(()=> ({}));
    const action = String(body?.action || "").toLowerCase(); // accept | reject | delete | pardon
    const notes  = String(body?.notes || "").slice(0, 500);
    const hide   = Boolean(body?.hideComment);

    const [r] = await sql/* sql */`SELECT * FROM public.comment_reports WHERE id = ${reportId} LIMIT 1`;
    if (!r) return NextResponse.json({ ok:false, message:"not found" }, { status:404 });
    if (r.status !== "open" && action !== "pardon" && action !== "delete") {
      return NextResponse.json({ ok:false, message:"already resolved" }, { status:409 });
    }

    const table = r.source === "manga" ? "public.manga_comments" : "public.page_comments";

    await sql`BEGIN`;
    try {
      if (action === "accept" || action === "reject") {
        await sql`
          UPDATE public.comment_reports
             SET status = ${action === "accept" ? "accepted" : "rejected"},
                 details = CASE WHEN ${notes}<>'' THEN coalesce(details,'') END,
                 resolved_at = now()
           WHERE id = ${reportId}
        `;

        if (action === "accept" && hide) {
          await sql/* sql */`
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name=split_part(${table},'.',2) AND column_name='is_hidden')
              THEN
                EXECUTE format('UPDATE %s SET is_hidden = true WHERE id = $1::uuid', ${table}) USING ${r.comment_id};
              END IF;
            END $$;`;
        }

        // —1 к счётчику
        await sql/* sql */`
          DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name=split_part(${table},'.',2) AND column_name='reports_count')
            THEN
              EXECUTE format('UPDATE %s SET reports_count = GREATEST(COALESCE(reports_count,0)-1,0) WHERE id = $1::uuid', ${table})
              USING ${r.comment_id};
            END IF;
          END $$;`;
      }

      if (action === "delete") {
        await sql/* sql */`EXECUTE format('DELETE FROM %s WHERE id = $1::uuid', ${table}) USING ${r.comment_id};`;
        await sql/* sql */`UPDATE public.comment_reports SET status='accepted', resolved_at=now() WHERE id=${reportId}`;
      }

      if (action === "pardon") {
        // снять флаги
        await sql/* sql */`UPDATE public.comment_reports SET status='rejected', resolved_at=now() WHERE id=${reportId}`;
        await sql/* sql */`
          DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name=split_part(${table},'.',2) AND column_name='reports_count')
            THEN
              EXECUTE format('UPDATE %s SET reports_count = 0 WHERE id = $1::uuid', ${table}) USING ${r.comment_id};
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name=split_part(${table},'.',2) AND column_name='is_hidden')
            THEN
              EXECUTE format('UPDATE %s SET is_hidden = false WHERE id = $1::uuid', ${table}) USING ${r.comment_id};
            END IF;
          END $$;`;
      }

      await sql`COMMIT`;
    } catch (e) {
      await sql`ROLLBACK`;
      throw e;
    }

    return NextResponse.json({ ok:true });
  } catch (e: any) {
    return NextResponse.json({ ok:false, message:e?.message || "server error" }, { status:500 });
  }
}
