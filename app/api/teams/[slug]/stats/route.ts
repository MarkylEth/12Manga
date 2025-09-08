import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { resolveTeamBySlug } from '../_utils'

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const team = await resolveTeamBySlug(params.slug)
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const sql = `
    with team_titles as (
      select manga_id
      from translator_team_manga
      where team_id = $1
    ),
    base as (
      -- главы с явным team_id
      select c.id, c.manga_id,
             lower(coalesce(c.review_status,'')) as review_status,
             lower(coalesce(c.status,''))        as status,
             c.pages_count
      from chapters c
      where c.team_id = $1::int

      union all

      -- главы без team_id, но принадлежащие тайтлам команды
      select c.id, c.manga_id,
             lower(coalesce(c.review_status,'')) as review_status,
             lower(coalesce(c.status,''))        as status,
             c.pages_count
      from chapters c
      where c.team_id is null
        and exists (select 1 from team_titles t where t.manga_id = c.manga_id)
    ),
    norm as (
      select *,
        (
          status = any (array['published','release','released','public','done','complete'])
          or review_status = any (array['approved','accept','accepted','ok'])
        ) as is_translated
      from base
    )
    select
      count(*) filter (where is_translated)                           as translated_chapters,
      coalesce(sum(pages_count) filter (where is_translated), 0)::int as translated_pages,
      count(*) filter (where not is_translated)                       as in_work
    from norm;
  `

  try {
    const r = await query(sql, [team.id])
    const row = r.rows[0] ?? { translated_chapters: 0, translated_pages: 0, in_work: 0 }
    return NextResponse.json({
      translated_chapters: Number(row.translated_chapters || 0),
      translated_pages:    Number(row.translated_pages || 0),
      in_work:             Number(row.in_work || 0),
    })
  } catch (e) {
    console.error('Team stats SQL failed:', e)
    return NextResponse.json({ translated_chapters: 0, translated_pages: 0, in_work: 0 })
  }
}
