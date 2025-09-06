// app/api/teams/[slug]/posts/[postId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getViewerId } from '@/lib/auth/route-guards'
import { resolveTeamBySlug } from '../../_utils' // из [postId] на два уровня вверх

type Params = { params: { slug: string; postId: string } }

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const uid = await getViewerId(req)
    if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const team = await resolveTeamBySlug(params.slug)
    if (!team) return NextResponse.json({ error: 'team_not_found' }, { status: 404 })

    // Удалять может автор или лидер команды (дополнительно к RLS)
    const sql = `
      delete from public.team_posts
       where id = $1
         and team_id = $2
         and (author_id = $3 or is_team_leader($2))
       returning id
    `
    const r = await query<{ id: string }>(sql, [params.postId, team.id, uid])
    if (r.rowCount === 0) {
      return NextResponse.json({ error: 'forbidden_or_not_found' }, { status: 403 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[DELETE team_posts]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const uid = await getViewerId(req)
    if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const team = await resolveTeamBySlug(params.slug)
    if (!team) return NextResponse.json({ error: 'team_not_found' }, { status: 404 })

    const payload = await req.json().catch(() => ({} as any))
    const { title, body, images, featured_image, post_type } = payload as {
      title?: string | null
      body?: string | null
      images?: string[] | null
      featured_image?: string | null
      post_type?: 'text' | 'announcement' | 'image'
    }

    if (typeof body === 'string' && body.length > 1000) {
      return NextResponse.json({ error: 'too_long' }, { status: 400 })
    }

    const sets: string[] = []
    const vals: any[] = []
    let i = 1
    if (typeof title !== 'undefined')         { sets.push(`title = $${i++}`);          vals.push(title ?? null) }
    if (typeof body  !== 'undefined')         { sets.push(`body = $${i++}`);           vals.push(body ?? null) }
    if (typeof images !== 'undefined')        { sets.push(`images = $${i++}`);         vals.push(images ?? null) }
    if (typeof featured_image !== 'undefined'){ sets.push(`featured_image = $${i++}`); vals.push(featured_image ?? null) }
    if (typeof post_type !== 'undefined')     { sets.push(`post_type = $${i++}`);      vals.push(post_type ?? 'text') }
    sets.push(`updated_at = now()`)

    if (sets.length === 1) return NextResponse.json({ ok: true })

    const sql = `
      update public.team_posts
         set ${sets.join(', ')}
       where id = $${i++}
         and team_id = $${i++}
         and author_id = $${i++}
       returning id
    `
    vals.push(params.postId, team.id, uid)

    const r = await query<{ id: string }>(sql, vals)
    if (r.rowCount === 0) {
      return NextResponse.json({ error: 'forbidden_or_not_found' }, { status: 403 })
    }
    return NextResponse.json({ ok: true, id: r.rows[0].id })
  } catch (e) {
    console.error('[PATCH team_posts]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
