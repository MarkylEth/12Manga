// app/api/moderation/comments/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ========= DB helper (Neon) ========= */
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

/* ========= utils ========= */
const isUUID = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

async function columnExists(sql: SqlFn, schema: string, table: string, column: string) {
  const r = await sql`
    select 1
    from information_schema.columns
    where table_schema=${schema} and table_name=${table} and column_name=${column}
    limit 1
  `;
  return r.length > 0;
}

/* ========= Types ответа ========= */
type ApiItem = {
  source: "manga" | "page" | "post";
  id: string;
  target_id: string | null;
  target_title: string | null;
  content: string;
  created_at: string | null;
  author_id: string | null;
  author_name: string | null;
  reports_count: number;
  is_hidden: boolean;
};

/* ========= GET ========= */
export async function GET(req: Request) {
  try {
    const sql = await getSql();
    if (!sql) return NextResponse.json({ ok: false, error: "DB not configured" }, { status: 500 });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const like = q ? `%${q}%` : null;
    const source = (searchParams.get("source") || "all").toLowerCase(); // all|manga|page|post
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") || 150)));
    const offset = Math.max(0, Number(searchParams.get("offset") || 0));

    const rows = await sql<ApiItem>`
      with mc as (
        select
          'manga'::text     as source,
          c.id::text        as id,
          c.manga_id::text  as target_id,
          (select m.title from public.manga m where m.id = c.manga_id limit 1) as target_title,
          coalesce(to_jsonb(c)->>'comment', to_jsonb(c)->>'content', '') as content,
          c.created_at      as created_at,
          c.user_id::text   as author_id,
          (select p.username from public.profiles p where p.id = c.user_id limit 1) as author_name,
          coalesce((
            select count(*)::int
            from public.comment_reports cr
            where cr.source='manga' and cr.comment_id = c.id and cr.status='open'
          ),0) as reports_count,
          coalesce((to_jsonb(c)->>'is_hidden')::boolean, false) as is_hidden
        from public.manga_comments c
      ),
      pc as (
        select
          'page'::text      as source,
          c.id::text        as id,
          c.page_id::text   as target_id,
          null::text        as target_title,
          coalesce(to_jsonb(c)->>'content', to_jsonb(c)->>'comment', '') as content,
          c.created_at      as created_at,
          c.user_id::text   as author_id,
          (select p.username from public.profiles p where p.id = c.user_id limit 1) as author_name,
          coalesce((
            select count(*)::int
            from public.comment_reports cr
            where cr.source='page' and cr.comment_id = c.id and cr.status='open'
          ),0) as reports_count,
          coalesce((to_jsonb(c)->>'is_hidden')::boolean, false) as is_hidden
        from public.page_comments c
      ),
      tc as (
        select
          'post'::text      as source,
          c.id::text        as id,
          c.post_id::text   as target_id,
          (
            select left(
              coalesce(
                tp.title,
                to_jsonb(tp)->>'content',
                to_jsonb(tp)->>'body',
                to_jsonb(tp)->>'text',
                to_jsonb(tp)->>'html',
                ''
              ), 60
            )
            from public.team_posts tp
            where tp.id = c.post_id
            limit 1
          ) as target_title,
          coalesce(to_jsonb(c)->>'content', to_jsonb(c)->>'comment', '') as content,
          c.created_at      as created_at,
          c.user_id::text   as author_id,
          (select p.username from public.profiles p where p.id = c.user_id limit 1) as author_name,
          coalesce((
            select count(*)::int
            from public.comment_reports cr
            where cr.source='post' and cr.comment_id = c.id and cr.status='open'
          ),0) as reports_count,
          coalesce((to_jsonb(c)->>'is_hidden')::boolean, false) as is_hidden
        from public.team_post_comments c
      ),
      unioned as (
        select * from mc
        union all
        select * from pc
        union all
        select * from tc
      )
      select *
      from unioned
      where (${source}::text = 'all' or source = ${source})
        and (${like ?? null}::text is null or content ilike ${like})
      order by created_at desc nulls last
      limit ${limit} offset ${offset}
    `;

    const totalRes = await sql<{ count: number }>`
      with mc as (
        select 'manga'::text as source,
               coalesce(to_jsonb(c)->>'comment', to_jsonb(c)->>'content','') as content
        from public.manga_comments c
      ),
      pc as (
        select 'page'::text as source,
               coalesce(to_jsonb(c)->>'content', to_jsonb(c)->>'comment','') as content
        from public.page_comments c
      ),
      tc as (
        select 'post'::text as source,
               coalesce(to_jsonb(c)->>'content', to_jsonb(c)->>'comment','') as content
        from public.team_post_comments c
      ),
      unioned as (
        select * from mc union all select * from pc union all select * from tc
      )
      select count(*)::int as count
      from unioned
      where (${source}::text = 'all' or source = ${source})
        and (${like ?? null}::text is null or content ilike ${like})
    `;
    const total = Number(totalRes?.[0]?.count ?? 0);

    const items = rows.map((r) => ({
      ...r,
      content: String(r.content ?? ""),
      target_title: r.target_title != null ? String(r.target_title) : null,
      created_at: r.created_at ? String(r.created_at) : null,
      author_id: r.author_id ? String(r.author_id) : null,
      author_name: r.author_name ? String(r.author_name) : null,
      reports_count: Number(r.reports_count ?? 0),
      is_hidden: Boolean(r.is_hidden),
    }));

    return NextResponse.json({ ok: true, items, total });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

/* ========= POST ========= */
export async function POST(req: Request) {
  try {
    const sql = await getSql();
    if (!sql) return NextResponse.json({ ok: false, error: "DB not configured" }, { status: 500 });

    const { id, source, action, reason } = await req.json().catch(() => ({}));
    if (!id || !source || !action) {
      return NextResponse.json({ ok: false, error: "id, source, action are required" }, { status: 400 });
    }
    if (!["manga", "page", "post"].includes(String(source))) {
      return NextResponse.json({ ok: false, error: "Bad source" }, { status: 400 });
    }
    if (!["approve", "reject", "delete"].includes(String(action))) {
      return NextResponse.json({ ok: false, error: "Bad action" }, { status: 400 });
    }
    if (!isUUID(String(id))) {
      return NextResponse.json({ ok: false, error: "Bad id (uuid expected)" }, { status: 400 });
    }

    const table =
      source === "manga" ? "manga_comments" :
      source === "page"  ? "page_comments"  :
                           "team_post_comments";

    const hasClosedAt   = await columnExists(sql, "public", "comment_reports", "closed_at");
    const hasReason     = await columnExists(sql, "public", "comment_reports", "mod_reason");
    const hasHidden     = await columnExists(sql, "public", table, "is_hidden");
    const hasRepCount   = await columnExists(sql, "public", table, "reports_count");

    /* ---- approve ---- */
    if (action === "approve") {
      // закрыть открытые жалобы
      if (hasClosedAt) {
        await sql`
          update public.comment_reports
             set status='closed', closed_at=now()
           where source=${source} and comment_id=${id}::uuid and status='open'
        `;
      } else {
        await sql`
          update public.comment_reports
             set status='closed'
           where source=${source} and comment_id=${id}::uuid and status='open'
        `;
      }

      // показать комментарий, если есть колонка
      if (hasHidden) {
        if (source === "manga") {
          await sql`update public.manga_comments set is_hidden=false where id=${id}::uuid`;
        } else if (source === "page") {
          await sql`update public.page_comments set is_hidden=false where id=${id}::uuid`;
        } else {
          await sql`update public.team_post_comments set is_hidden=false where id=${id}::uuid`;
        }
      }

      // СБРОСИТЬ СЧЁТЧИК ЖАЛОБ В 0
      if (hasRepCount) {
        if (source === "manga") {
          await sql`update public.manga_comments set reports_count=0 where id=${id}::uuid`;
        } else if (source === "page") {
          await sql`update public.page_comments set reports_count=0 where id=${id}::uuid`;
        } else {
          await sql`update public.team_post_comments set reports_count=0 where id=${id}::uuid`;
        }
      }

      return NextResponse.json({ ok: true, id, source, action });
    }

    /* ---- reject ---- */
    if (action === "reject") {
      // скрыть комментарий
      if (hasHidden) {
        if (source === "manga") {
          await sql`update public.manga_comments set is_hidden=true where id=${id}::uuid`;
        } else if (source === "page") {
          await sql`update public.page_comments set is_hidden=true where id=${id}::uuid`;
        } else {
          await sql`update public.team_post_comments set is_hidden=true where id=${id}::uuid`;
        }
      }

      // закрыть жалобы (+ reason/closed_at если есть колонки)
      if (hasClosedAt && hasReason) {
        await sql`
          update public.comment_reports
             set status='closed', closed_at=now(), mod_reason=coalesce(${reason ?? null}::text, mod_reason)
           where source=${source} and comment_id=${id}::uuid and status='open'
        `;
      } else if (hasClosedAt) {
        await sql`
          update public.comment_reports
             set status='closed', closed_at=now()
           where source=${source} and comment_id=${id}::uuid and status='open'
        `;
      } else if (hasReason) {
        await sql`
          update public.comment_reports
             set status='closed', mod_reason=coalesce(${reason ?? null}::text, mod_reason)
           where source=${source} and comment_id=${id}::uuid and status='open'
        `;
      } else {
        await sql`
          update public.comment_reports
             set status='closed'
           where source=${source} and comment_id=${id}::uuid and status='open'
        `;
      }

      // СБРОСИТЬ СЧЁТЧИК ЖАЛОБ В 0 (чтобы на карточке тайтла пропала плашка)
      if (hasRepCount) {
        if (source === "manga") {
          await sql`update public.manga_comments set reports_count=0 where id=${id}::uuid`;
        } else if (source === "page") {
          await sql`update public.page_comments set reports_count=0 where id=${id}::uuid`;
        } else {
          await sql`update public.team_post_comments set reports_count=0 where id=${id}::uuid`;
        }
      }

      return NextResponse.json({ ok: true, id, source, action, reason: reason ?? null });
    }

    /* ---- delete ---- */
    let deleted: Row[] = [];
    if (source === "manga") {
      deleted = await sql`delete from public.manga_comments where id=${id}::uuid returning id::text`;
    } else if (source === "page") {
      deleted = await sql`delete from public.page_comments where id=${id}::uuid returning id::text`;
    } else {
      deleted = await sql`delete from public.team_post_comments where id=${id}::uuid returning id::text`;
    }
    if (deleted.length !== 1) {
      return NextResponse.json(
        { ok: false, error: deleted.length === 0 ? "Not found" : "Safety check failed" },
        { status: 400 }
      );
    }
    await sql`delete from public.comment_reports where source=${source} and comment_id=${id}::uuid`;
    return NextResponse.json({ ok: true, deletedId: deleted[0].id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
