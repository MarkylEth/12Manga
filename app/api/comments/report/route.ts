import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
type SqlFn = <T = Row>(q: TemplateStringsArray, ...vals: any[]) => Promise<T[]>;
type Source = "manga" | "page";

/* DB helper (Neon) */
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

/* тут подставь свою аутентификацию */
async function getUserId(): Promise<string | null> {
  // верни uuid пользователя из своей auth-системы
  return null;
}

const REASONS: Record<string, true> = {
  spam: true, offtopic: true, insult: true, spoiler: true, nsfw: true, illegal: true, other: true
};
const isUUID = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export async function POST(req: Request) {
  try {
    const sql = await getSql();
    if (!sql) return NextResponse.json({ ok:false, message:"DB not configured" }, { status:500 });

    const body = await req.json().catch(() => ({}));
    const source = String(body?.source || "manga").toLowerCase() as Source;
    const commentId = String(body?.commentId || "");
    const reason = String(body?.reason || "").toLowerCase();
    let details = String(body?.details || "").trim();
    const me = await getUserId();

    if (!["manga","page"].includes(source)) return NextResponse.json({ ok:false, message:"bad source" }, { status:400 });
    if (!isUUID(commentId)) return NextResponse.json({ ok:false, message:"bad commentId" }, { status:400 });
    if (!REASONS[reason]) return NextResponse.json({ ok:false, message:"bad reason" }, { status:400 });
    if (details.length > 500) details = details.slice(0, 500);

    // простейший rate-limit
    const [{ cnt }] = await sql<{ cnt: string }>`
      SELECT COUNT(*)::int AS cnt
      FROM public.comment_reports
      WHERE (user_id = ${me} OR ${me} IS NULL)
        AND created_at > now() - interval '5 minutes'
    `;
    if (Number(cnt) >= 5) {
      return NextResponse.json({ ok:false, message:"too many reports, try later" }, { status:429 });
    }

    // вставляем (uniq индекс не даст дублировать открытую жалобу)
    try {
      const rows = await sql`
        INSERT INTO public.comment_reports (source, comment_id, user_id, reason, details, status, created_at)
        VALUES (${source}, ${commentId}::uuid, ${me}, ${reason}, NULLIF(${details},''), 'open', now())
        RETURNING id
      `;

      // ++ reports_count (если колонка существует)
      const table = source === "manga" ? "public.manga_comments" : "public.page_comments";
      await sql/* sql */`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=split_part(${table},'.',2) AND column_name='reports_count') THEN
          EXECUTE format('UPDATE %s SET reports_count = COALESCE(reports_count,0)+1 WHERE id = $1::uuid', ${table})
          USING ${commentId};
        END IF;
      END $$;`;

      return NextResponse.json({ ok:true, reportId: rows?.[0]?.id ?? null });
    } catch (e: any) {
      if (e?.code === "23505") return NextResponse.json({ ok:true, message:"already reported" });
      throw e;
    }
  } catch (e: any) {
    return NextResponse.json({ ok:false, message:e?.message || "server error" }, { status:500 });
  }
}
