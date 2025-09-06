import { NextResponse } from "next/server";
import * as jose from "jose";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =============== helpers & types =============== */
type Row = Record<string, any>;
type SqlFn = <T = Row>(q: TemplateStringsArray, ...vals: any[]) => Promise<T[]>;

const AUTOHIDE = 5; // скрыть при >= 5 жалоб

const ALLOWED: Record<string, true> = {
  abuse: true, harassment: true, spam: true, hate: true, porn: true,
  illegal_trade: true, spoiler: true, offtopic: true, other: true,
  // синонимы на всякий случай
  insult: true, nsfw: true, illegal: true,
};

const isUUID = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

function parseCookies(header: string | null) {
  const out: Record<string, string> = {};
  (header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

/** Принимает "62" ИЛИ "62-one-piece" и возвращает 62; иначе null */
function parseMangaParam(s?: string | null): number | null {
  if (!s) return null;
  const m = /^(\d+)/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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

async function getUserId(req: Request): Promise<string | null> {
  // dev-фолбэк (удобно для локалки)
  if (process.env.NODE_ENV !== "production") {
    const dev = req.headers.get("x-dev-user");
    if (dev && isUUID(dev)) return dev;
  }

  const token = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  const sess = await verifySession(token);
  const sub = sess?.sub;
  if (sub && isUUID(sub)) return sub;

  // dev: попытаться декодировать без verify
  if (process.env.NODE_ENV !== "production" && token) {
    try {
      const decoded = jose.decodeJwt(token);
      const id = (decoded.sub || (decoded as any).uid || (decoded as any).id) as string | undefined;
      if (id && isUUID(id)) return id;
    } catch {}
  }
  return null;
}

async function hasColumn(sql: SqlFn, tableName: string, column: string) {
  const r = await sql/* sql */`
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name=${tableName} AND column_name=${column}
     LIMIT 1
  `;
  return r.length > 0;
}

/* =============== route =============== */
export async function POST(
  req: Request,
  ctx: { params: { mangaId?: string; commentId?: string } }
) {
  try {
    const sql = await getSql();
    if (!sql) return NextResponse.json({ ok: false, message: "DB not configured" }, { status: 500 });

    // auth
    const me = await getUserId(req);
    if (!me) return NextResponse.json({ ok: false, message: "auth required" }, { status: 401 });

    // params (терпимо относимся к slug в mangaId)
    const midFromUrl = parseMangaParam(ctx.params?.mangaId ?? null);
    const commentId = String(ctx.params?.commentId || "").trim();
    if (!isUUID(commentId))
      return NextResponse.json({ ok: false, message: "bad commentId" }, { status: 400 });

    // body
    const body = await req.json().catch(() => ({}));
    const reason = String(body?.reason || "").toLowerCase();
    let note = String(body?.note || body?.details || "").trim();
    if (!ALLOWED[reason]) return NextResponse.json({ ok: false, message: "bad reason" }, { status: 400 });
    if (note.length > 1000) note = note.slice(0, 1000);

    // найдём комментарий и его manga_id — так мы и проверим принадлежность,
    // независимо от того, был ли в URL slug или чистый id
    const [c] = await sql/* sql */`
      SELECT id, manga_id,
             COALESCE(reports_count,0)::int AS reports_count,
             COALESCE(is_hidden,false)      AS is_hidden
        FROM public.manga_comments
       WHERE id = ${commentId}::uuid
       LIMIT 1
    `;
    if (!c) return NextResponse.json({ ok: false, message: "comment not found" }, { status: 404 });

    // если из URL удалось разобрать id — проверим консистентность
    if (midFromUrl !== null && Number(c.manga_id) !== midFromUrl) {
      return NextResponse.json({ ok: false, message: "comment not for this manga" }, { status: 404 });
    }

    // запрет повторной жалобы с одного аккаунта на один и тот же коммент
    const dup = await sql/* sql */`
      SELECT 1
        FROM public.comment_reports
       WHERE source='manga'
         AND comment_id=${commentId}::uuid
         AND user_id=${me}::uuid
       LIMIT 1
    `;
    if (dup.length) {
      return NextResponse.json({
        ok: true,
        message: "already reported",
        is_hidden: Boolean(c.is_hidden),
        reports_count: Number(c.reports_count ?? 0),
      });
    }

    // rate limit: ≤ 5 жалоб за 5 минут
    const [{ cnt }] = await sql<{ cnt: string }>`
      SELECT COUNT(*)::int AS cnt
        FROM public.comment_reports
       WHERE user_id = ${me}::uuid
         AND created_at > now() - interval '5 minutes'
    `;
    if (Number(cnt) >= 5) {
      return NextResponse.json({ ok: false, message: "too many reports, try later" }, { status: 429 });
    }

    try {
      await sql/* sql */`BEGIN`;

      // вставка жалобы
      await sql/* sql */`
        INSERT INTO public.comment_reports (source, comment_id, user_id, reason, details, status, created_at)
        VALUES ('manga', ${commentId}::uuid, ${me}::uuid, ${reason}, NULLIF(${note}, ''), 'open', now())
      `;

      // апдейт счётчика и автоскрытие (если есть соответствующие колонки)
      const [hasRep, hasHidden] = await Promise.all([
        hasColumn(sql, "manga_comments", "reports_count"),
        hasColumn(sql, "manga_comments", "is_hidden"),
      ]);

      if (hasRep && hasHidden) {
        await sql/* sql */`
          UPDATE public.manga_comments
             SET reports_count = COALESCE(reports_count,0) + 1,
                 is_hidden     = CASE WHEN COALESCE(reports_count,0) + 1 >= ${AUTOHIDE}
                                      THEN true ELSE is_hidden END
           WHERE id = ${commentId}::uuid
        `;
      } else if (hasRep) {
        await sql/* sql */`
          UPDATE public.manga_comments
             SET reports_count = COALESCE(reports_count,0) + 1
           WHERE id = ${commentId}::uuid
        `;
      }

      await sql/* sql */`COMMIT`;
    } catch (e: any) {
      await sql/* sql */`ROLLBACK`;
      if (e?.code === "23505") {
        // уникальный индекс (source, comment_id, user_id) — уже есть жалоба
        return NextResponse.json({
          ok: true,
          message: "already reported",
          is_hidden: Boolean(c.is_hidden),
          reports_count: Number(c.reports_count ?? 0),
        });
      }
      throw e;
    }

    // актуальное состояние
    const cur = await sql/* sql */`
      SELECT COALESCE(reports_count,0)::int AS reports_count,
             COALESCE(is_hidden,false)      AS is_hidden
        FROM public.manga_comments
       WHERE id = ${commentId}::uuid
       LIMIT 1
    `;

    return NextResponse.json({
      ok: true,
      reports_count: Number(cur?.[0]?.reports_count ?? 0),
      is_hidden: Boolean(cur?.[0]?.is_hidden),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || "server error" }, { status: 500 });
  }
}
