// app/api/manga/[id]/teams/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth/route-guards';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const mangaId = Number(params.id || 0);
  if (!mangaId) return NextResponse.json({ items: [] });

  const { rows } = await query(
    `select t.id, t.name, t.slug, t.avatar_url, t.verified
     from translator_team_manga tm
     join translator_teams t on t.id = tm.team_id
     where tm.manga_id=$1
     order by t.name asc`,
    [mangaId]
  );
  return NextResponse.json({ items: rows || [] });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const mod = await requireRole(req, ['admin', 'moderator']);
  const me = await getAuthUser();
  if (!mod.ok && !me) return NextResponse.json({ ok: false }, { status: 401 });

  const mangaId = Number(params.id || 0);
  const body = await req.json().catch(() => ({}));
  const teamId = Number(body?.team_id || 0);
  if (!mangaId || !teamId) return NextResponse.json({ ok: false, message: 'bad ids' }, { status: 400 });

  // если не модератор — разрешаем только лидеру своей команды
  if (!mod.ok) {
    const { rowCount } = await query(
      `select 1 from translator_team_members where team_id=$1 and user_id::text=$2 and (is_leader is true or role='leader') limit 1`,
      [teamId, me!.id]
    );
    if (!rowCount) return NextResponse.json({ ok: false, message: 'forbidden' }, { status: 403 });
  }

  await query(
    `insert into translator_team_manga (team_id, manga_id, created_at)
     values ($1,$2, now())
     on conflict do nothing`,
    [teamId, mangaId]
  );

  const { rows } = await query(
    `select t.id, t.name, t.slug, t.avatar_url, t.verified
     from translator_team_manga tm
     join translator_teams t on t.id = tm.team_id
     where tm.manga_id=$1`,
    [mangaId]
  );
  return NextResponse.json({ ok: true, items: rows || [] });
}
