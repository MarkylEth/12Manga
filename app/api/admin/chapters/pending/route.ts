import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth/route-guards';

/**
 * GET /api/admin/chapters/pending
 * Возвращает главы, ожидающие проверки (ready | draft), не одобренные.
 * Требует роль admin|moderator.
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, ['admin', 'moderator']);
  if (!auth.ok) return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });

  const { rows } = await query(
    `
    select
      c.id,
      c.manga_id,
      coalesce(c.chapter_number,0)       as chapter_number,
      coalesce(c.volume,0)               as volume,
      coalesce(c.title,'')               as title,
      lower(c.status)                    as status,
      coalesce(c.pages_count,0)          as pages_count,
      c.created_at,
      m.title                            as manga_title,
      m.slug                             as manga_slug
    from chapters c
    join manga m on m.id = c.manga_id
    where lower(c.status) in ('ready','draft')
      and c.approved_by is null
    order by c.created_at desc
    limit 200
    `
  );

  return NextResponse.json({ ok: true, items: rows });
}
