// app/api/manga/[id]/teams/[teamId]/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth/route-guards';

export async function DELETE(req: Request, { params }: { params: { id: string; teamId: string } }) {
  const mod = await requireRole(req, ['admin', 'moderator']);
  const me = await getAuthUser();
  if (!mod.ok && !me) return NextResponse.json({ ok: false }, { status: 401 });

  const mangaId = Number(params.id || 0);
  const teamId = Number(params.teamId || 0);
  if (!mangaId || !teamId) return NextResponse.json({ ok: false, message: 'bad ids' }, { status: 400 });

  if (!mod.ok) {
    const { rowCount } = await query(
      `select 1 from translator_team_members where team_id=$1 and user_id::text=$2 and (is_leader is true or role='leader') limit 1`,
      [teamId, me!.id]
    );
    if (!rowCount) return NextResponse.json({ ok: false, message: 'forbidden' }, { status: 403 });
  }

  await query(`delete from translator_team_manga where manga_id=$1 and team_id=$2`, [mangaId, teamId]);
  return NextResponse.json({ ok: true });
}
