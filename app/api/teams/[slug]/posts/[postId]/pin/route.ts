import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getViewerId } from '@/lib/auth/route-guards'
import { isTeamEditor, resolveTeamBySlug } from '../../../_utils'

type Params = { params: { slug: string; postId: string } }
const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const team = await resolveTeamBySlug(params.slug)
    if (!team) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const uid = await getViewerId(req)
    if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const can = await isTeamEditor(team.id, uid)
    if (!can) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const postId = params.postId
    if (!isUuid(postId)) return NextResponse.json({ error: 'bad_post_id' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const pinned = !!body?.pinned

    await query('update team_posts set is_pinned=$1 where id=$2::uuid and team_id=$3', [pinned, postId, team.id])

    return NextResponse.json({ ok: true, pinned })
  } catch (e) {
    console.error('pin PATCH error', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
