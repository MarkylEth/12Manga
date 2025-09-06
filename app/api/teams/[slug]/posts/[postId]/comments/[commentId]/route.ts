// app/api/teams/[slug]/posts/[postId]/comments/[commentId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getViewerId } from '@/lib/auth/route-guards'
import { resolveTeamBySlug, isTeamEditor } from '../../../../_utils'

type Params = { params: { slug: string; postId: string; commentId: string } }

export async function DELETE(req: NextRequest, { params }: Params) {
  const team = await resolveTeamBySlug(params.slug)
  if (!team) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const uid = await getViewerId(req)
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const canEditAny = await isTeamEditor(team.id, uid)

  try {
    await query('begin')
    const d = await query(
      canEditAny
        ? 'delete from team_post_comments where id=$1::uuid returning post_id'
        : 'delete from team_post_comments where id=$1::uuid and user_id=$2::uuid returning post_id',
      canEditAny ? [params.commentId] : [params.commentId, uid]
    )
    if (d.rowCount) {
      await query(
        'update team_posts set comments_count = greatest(comments_count-1,0) where id=$1::uuid',
        [d.rows[0].post_id]
      )
    }
    await query('commit')
    return NextResponse.json({ ok: true })
  } catch (e) {
    await query('rollback').catch(() => {})
    console.error('comment DELETE error', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
