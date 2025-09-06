import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function reg(name: string) {
  const { rows } = await query(`select to_regclass($1) as oid`, [name]);
  return !!rows?.[0]?.oid;
}
async function col(t: string, c: string) {
  const { rowCount } = await query(
    `select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2 limit 1`,
    [t, c]
  );
  return (rowCount ?? 0) > 0;
}

export async function GET(req: Request, { params }: { params: { pageId: string } }) {
  try {
    const pageId = Number(params.pageId);
    if (!Number.isFinite(pageId)) return NextResponse.json({ ok: true, items: [] });

    const url = new URL(req.url);
    const userId = url.searchParams.get("user");

    const T_PG = (await reg("public.chapter_pages")) ? "chapter_pages" : "страницы_глав";
    const fk   = (await col(T_PG, "chapter_id")) ? "chapter_id" : (await col(T_PG, "chapter_id_bigint")) ? "chapter_id_bigint" : "chapter_id";

    const T_TEAMS = (await reg("public.translator_teams")) ? "translator_teams" :
                    (await reg("public.teams")) ? "teams" : null;
    const T_TEAM_MEMBERS = (await reg("public.translator_team_members")) ? "translator_team_members" :
                           (await reg("public.team_members")) ? "team_members" : null;

    // Комменты + лайки
    const sql = `
      with pc as (
        select c.*
        from page_comments c
        where c.page_id = $1
      ),
      likes as (
        select comment_id, count(*)::int as likes_count
        from page_comment_likes
        where comment_id in (select id from pc)
        group by comment_id
      )
      select
        c.*,
        coalesce(l.likes_count,0) as likes_count
      from pc c
      left join likes l on l.comment_id = c.id
      order by c.created_at asc, c.id asc
    `;
    const { rows } = await query(sql, [pageId]);

    // профили
    const uids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const users: Record<string, { username?: string; avatar_url?: string }> = {};
    if (uids.length) {
      const p = await query(
        `select id, username, avatar_url from profiles where id = any($1::uuid[])`,
        [uids]
      );
      for (const r of p.rows) users[r.id] = { username: r.username, avatar_url: r.avatar_url };
    }

    // команды
    const teamIds = Array.from(new Set(rows.map((r) => r.team_id).filter(Boolean)));
    const teams: Record<number, { name?: string; avatar_url?: string }> = {};
    if (teamIds.length && T_TEAMS) {
      const t = await query(
        `select id, name, avatar_url from ${T_TEAMS} where id = any($1::int[])`,
        [teamIds]
      );
      for (const r of t.rows) teams[r.id] = { name: r.name, avatar_url: r.avatar_url };
    }

    // likedByMe
    const likedByMe: Record<string, boolean> = {};
    if (userId) {
      const l = await query(
        `select comment_id from page_comment_likes where user_id = $1 and comment_id = any($2::uuid[])`,
        [userId, rows.map((r) => r.id)]
      );
      for (const r of l.rows) likedByMe[r.comment_id] = true;
    }

    return NextResponse.json({ ok: true, items: rows, users, teams, likedByMe });
  } catch (e: any) {
    console.error("[GET /comments] err", e);
    return NextResponse.json({ ok: false, items: [], error: e?.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { pageId: string } }) {
  try {
    const pageId = Number(params.pageId);
    const body = await req.json().catch(() => ({}));
    const { user_id, content, parent_id, as_team, pin } = body || {};
    if (!user_id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!content) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });

    const T_PG = (await reg("public.chapter_pages")) ? "chapter_pages" : "страницы_глав";
    const fk   = (await col(T_PG, "chapter_id")) ? "chapter_id" : (await col(T_PG, "chapter_id_bigint")) ? "chapter_id_bigint" : "chapter_id";

    // page meta
    const metaSql = `
      select id, ${fk} as chapter_id,
             coalesce(nullif(image_url,''), nullif(url,''), nullif(path,'')) as image_url,
             coalesce(page_index, page_number, 0)::int as page_number
      from ${T_PG} where id = $1
      limit 1
    `;
    const meta = await query(metaSql, [pageId]);
    const page = meta.rows[0];
    if (!page) return NextResponse.json({ ok: false, error: "page not found" }, { status: 404 });

    // Права «от команды/закрепить» — только лидерам
    let is_team_comment = false;
    let team_id: number | null = null;
    let is_pinned = false;

    const T_TEAMS = (await reg("public.translator_teams")) ? "translator_teams" :
                    (await reg("public.teams")) ? "teams" : null;
    const T_TEAM_MEMBERS = (await reg("public.translator_team_members")) ? "translator_team_members" :
                           (await reg("public.team_members")) ? "team_members" : null;

    if (as_team && T_TEAM_MEMBERS && T_TEAMS) {
      // выясним команду главы
      const ch = await query(`select team_id from chapters where id = $1 limit 1`, [page.chapter_id]);
      const chTeam = ch.rows[0]?.team_id ?? null;

      if (chTeam != null) {
        // роль пользователя
        const member = await query(
          `select role from ${T_TEAM_MEMBERS} where team_id = $1 and user_id = $2 limit 1`,
          [chTeam, user_id]
        );
        const role = String(member.rows[0]?.role || "").toLowerCase();
        const isLeader = ["leader", "lead", "owner", "admin"].includes(role);
        if (isLeader) {
          is_team_comment = true;
          team_id = chTeam;
          is_pinned = !!pin;
        }
      }
    }

    const ins = await query(
      `insert into page_comments
       (page_id, chapter_id, user_id, content, parent_id, is_team_comment, team_id, is_pinned, page_url, page_number)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning *`,
      [pageId, page.chapter_id, user_id, content, parent_id ?? null, is_team_comment, team_id, is_pinned, page.image_url, page.page_number]
    );

    return NextResponse.json({ ok: true, item: ins.rows[0] });
  } catch (e: any) {
    console.error("[POST /comments] err", e);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
