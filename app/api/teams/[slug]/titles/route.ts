import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { resolveTeamBySlug } from '../_utils'

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const team = await resolveTeamBySlug(params.slug)
  if (!team) return NextResponse.json({ items: [] }, { status: 404 })

  // Попытка №1: предполагаем, что в manga есть name
  const sql1 = `
    select m.id,
           m.name as name,
           m.slug as slug,
           m.cover_url as cover_url,
           m.status as status,
           coalesce(m.rating, 0) as rating,
           coalesce(m.updated_at, m.created_at, now()) as last_update
    from translator_team_manga ttm
    join manga m on m.id = ttm.manga_id
    where ttm.team_id = $1
    order by last_update desc nulls last
    limit 300
  `
  // Попытка №2: в manga есть title (а поля из выборки, которых нет, мы выкинем)
  const sql2 = `
    select m.id,
           m.title as name,
           null::text as slug,
           null::text as cover_url,
           null::text as status,
           0::int as rating,
           now() as last_update
    from translator_team_manga ttm
    join manga m on m.id = ttm.manga_id
    where ttm.team_id = $1
    limit 300
  `
  // Попытка №3: минимальный фолбэк — только id
  const sql3 = `
    select m.id,
           null::text as name,
           null::text as slug,
           null::text as cover_url,
           null::text as status,
           0::int as rating,
           now() as last_update
    from translator_team_manga ttm
    join manga m on m.id = ttm.manga_id
    where ttm.team_id = $1
    limit 300
  `

  try {
    const r1 = await query(sql1, [team.id])
    return NextResponse.json({ items: r1.rows })
  } catch {
    try {
      const r2 = await query(sql2, [team.id])
      return NextResponse.json({ items: r2.rows })
    } catch {
      const r3 = await query(sql3, [team.id])
      return NextResponse.json({ items: r3.rows })
    }
  }
}
