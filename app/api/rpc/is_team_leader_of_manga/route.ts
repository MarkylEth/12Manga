import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireLoggedIn, requireRole } from '@/lib/auth/route-guards';

export async function POST(req: Request) {
  // DEV-ключ пропускаем как admin
  const asAdmin = await requireRole(req, ['admin']);
  if (asAdmin.ok) return NextResponse.json({ ok:true, allowed:true });

  const auth = await requireLoggedIn(req);
  if (!auth.ok) return NextResponse.json({ ok:false, error:'no_session' }, { status: 401 });

  const { manga_id } = await req.json().catch(() => ({}));
  const uid = auth.user.id;

  // Таблицы могут называться чуть иначе — подгони при необходимости.
  // Ожидаем translator_team_members(is_leader boolean), translator_team_manga(manga_id, team_id)
  const sql = `
    select 1
      from translator_team_members m
      join translator_team_manga ttm on ttm.team_id = m.team_id
     where m.user_id::text = $1
       and m.is_leader = true
       and ttm.manga_id = $2
     limit 1`;
  const { rowCount } = await query(sql, [uid, manga_id]);
  return NextResponse.json({ ok:true, allowed: rowCount! > 0 });
}
