import { NextResponse } from 'next/server';

/* ========= runtime ========= */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ========= small helpers ========= */
type Row = Record<string, any>;
type SqlFn = <T = Row>(q: TemplateStringsArray, ...vals: any[]) => Promise<T[]>;

/** Neon sql helper */
async function getSql(): Promise<SqlFn | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const mod: any = await import('@neondatabase/serverless');
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

/** безопасный toInt */
function toInt(v: string | number | null | undefined) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

/* ========= Types для ответа ========= */
type CommentDTO = {
  id: string;
  manga_id: number;
  user_id: string | null;
  comment: string;
  created_at: string;
  parent_id: string | null;

  // опциональные поля (если их нет в таблице — будут дефолты):
  is_team_comment?: boolean | null;
  team_id?: number | null;
  is_pinned?: boolean | null;
  is_hidden?: boolean | null;
  reports_count?: number | null;

  profile?: { id: string | null; username?: string | null; avatar_url?: string | null } | null;
};

/* ========= GET: список комментариев тайтла ========= */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const sql = await getSql();
    if (!sql) {
      return NextResponse.json({ ok: false, message: 'DB not configured' }, { status: 500 });
    }

    const id = toInt(ctx.params?.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, message: 'Bad manga id' }, { status: 400 });
    }

    // Берём *все* поля из таблицы (SELECT c.*), чтобы не падать, если некоторых колонок нет.
    // Профиль пользователя подмешиваем отдельными alias-полями.
    const rows = await sql/* sql */`
      SELECT
        c.*,
        p.username  AS _profile_username,
        p.avatar_url AS _profile_avatar
      FROM public.manga_comments AS c
      LEFT JOIN public.profiles AS p ON p.id = c.user_id
      WHERE c.manga_id = ${id}
      ORDER BY c.created_at ASC
    `;

    // Нормализуем под то, что ждёт фронт.
    const items: CommentDTO[] = rows.map((r: Row) => ({
      id: String(r.id),
      manga_id: Number(r.manga_id),
      user_id: r.user_id ? String(r.user_id) : null,
      comment: String(r.comment ?? ''),
      created_at: String(r.created_at ?? new Date().toISOString()),
      parent_id: r.parent_id ? String(r.parent_id) : null,

      // поля могут отсутствовать — дефолты не сломают фронт
      is_team_comment: typeof r.is_team_comment === 'boolean' ? r.is_team_comment : null,
      team_id: r.team_id != null ? Number(r.team_id) : null,
      is_pinned: typeof r.is_pinned === 'boolean' ? r.is_pinned : false,
      is_hidden: typeof r.is_hidden === 'boolean' ? r.is_hidden : false,
      reports_count: r.reports_count != null ? Number(r.reports_count) : 0,

      profile: {
        id: r.user_id ? String(r.user_id) : null,
        username: r._profile_username ?? null,
        avatar_url: r._profile_avatar ?? null,
      },
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message || 'Server error' },
      { status: 500 },
    );
  }
}
