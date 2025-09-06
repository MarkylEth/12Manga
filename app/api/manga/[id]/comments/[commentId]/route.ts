// app/api/manga/[id]/comments/[commentId]/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseMangaId(raw: string | string[] | undefined): number {
  const s = String(Array.isArray(raw) ? raw[0] : raw ?? '').trim();
  const m = s.match(/^\d+/)?.[0];
  const n = m ? parseInt(m, 10) : Number.NaN;
  return Number.isFinite(n) ? n : Number.NaN;
}

async function getRow(commentId: string, mangaId: number) {
  const r = await query(
    `
      select id::text, manga_id::int, user_id::text,
             is_team_comment, team_id::int, is_pinned
      from public.manga_comments
      where id = $1 and manga_id = $2
      limit 1
    `,
    [commentId, mangaId]
  );
  return r.rows?.[0] || null;
}

const bad = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error }, { status });
const ok = (data: any) => NextResponse.json({ ok: true, ...data });

/* ============== PATCH: toggle pin ============== */
export async function PATCH(req: NextRequest, ctx: { params: { id: string; commentId: string } }) {
  const user = await getAuthUser();
  if (!user) return bad('unauthorized', 401);

  const mangaId = parseMangaId(ctx.params?.id);
  if (!Number.isFinite(mangaId)) return bad('bad_id', 400);

  const commentId = String(ctx.params?.commentId || '').trim();
  if (!commentId) return bad('bad_comment_id', 400);

  const body = await req.json().catch(() => ({}));
  const is_pinned: boolean | undefined = typeof body?.is_pinned === 'boolean' ? body.is_pinned : undefined;
  if (typeof is_pinned !== 'boolean') return bad('missing_is_pinned', 400);

  // Достаём запись, проверяем права
  const row = await getRow(commentId, mangaId);
  if (!row) return bad('not_found', 404);

  // Модерация всегда может, автор — нет, лидер команды — смотри ниже.
  const role = (user as any)?.role ?? 'user';
  const canModerate = role === 'moderator' || role === 'admin';

  // При необходимости добавь сюда свою проверку «лидер команды», если есть таблица membership.
  if (!canModerate) return bad('forbidden', 403);

  const upd = await query(
    `
      update public.manga_comments
      set is_pinned = $1
      where id = $2 and manga_id = $3
      returning id::text, manga_id::int, is_pinned
    `,
    [is_pinned, commentId, mangaId]
  );

  return ok({ item: upd.rows?.[0] || null });
}

/* ============== DELETE: comment + replies ============== */
export async function DELETE(_req: NextRequest, ctx: { params: { id: string; commentId: string } }) {
  const user = await getAuthUser();
  if (!user) return bad('unauthorized', 401);

  const mangaId = parseMangaId(ctx.params?.id);
  if (!Number.isFinite(mangaId)) return bad('bad_id', 400);

  const commentId = String(ctx.params?.commentId || '').trim();
  if (!commentId) return bad('bad_comment_id', 400);

  const row = await getRow(commentId, mangaId);
  if (!row) return bad('not_found', 404);

  const role = (user as any)?.role ?? 'user';
  const canModerate = role === 'moderator' || role === 'admin';
  const isAuthor = row.user_id === user.id;

  // Автор может удалить своё; модерация — любое.
  if (!isAuthor && !canModerate) return bad('forbidden', 403);

  await query(
    `
      delete from public.manga_comments
      where (id = $1 or parent_id = $1) and manga_id = $2
    `,
    [commentId, mangaId]
  );

  return ok({ deleted: true });
}
