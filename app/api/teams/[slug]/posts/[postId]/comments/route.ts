// app/api/teams/[slug]/posts/[postId]/comments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getViewerId } from '@/lib/auth/route-guards'
import { resolveTeamBySlug } from '../../../_utils'

type Params = { params: { slug: string; postId: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const { slug, postId } = params
  const team = await resolveTeamBySlug(slug)
  if (!team) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

  const r = await query<{
    id: string
    post_id: string
    user_id: string
    content: string
    created_at: string
    updated_at: string
    parent_id: string | null
    username: string | null
    avatar_url: string | null
    team_role: string | null
  }>(
    `
    select
      c.id::text,
      c.post_id::text,
      c.user_id::text,
      c.content,
      c.created_at,
      c.updated_at,
      c.parent_id::text,
      p.username,
      p.avatar_url,
      m.role as team_role                 -- ВАЖНО: роль в этой команде
    from team_post_comments c
    left join profiles p
      on p.id = c.user_id
    left join translator_team_members m
      on m.team_id = $2 and m.user_id = c.user_id
    where c.post_id = $1::uuid
    order by c.created_at asc
    limit $3 offset $4
    `,
    [postId, team.id, limit, offset]
  )

  return NextResponse.json({
    items: r.rows,
    nextOffset: offset + r.rows.length,
    limit
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { slug, postId } = params
  const team = await resolveTeamBySlug(slug)
  if (!team) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const uid = await getViewerId(req)
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const postCheck = await query(
    'select 1 from team_posts where id = $1::uuid and team_id = $2',
    [postId, team.id]
  )
  if (!postCheck.rowCount) {
    return NextResponse.json({ error: 'post_not_found' }, { status: 404 })
  }

  const payload = await req.json().catch(() => ({} as any))
  const content = String(payload?.content ?? '').trim()
  const parent = payload?.parent_id ? String(payload.parent_id) : null

  if (!content) return NextResponse.json({ error: 'empty_content' }, { status: 400 })
  if (content.length > 2000) return NextResponse.json({ error: 'content_too_long' }, { status: 400 })

  try {
    await query('begin')

    const ins = await query<{ id: string }>(
      `insert into team_post_comments (post_id, user_id, content, parent_id)
       values ($1::uuid, $2::uuid, $3, $4::uuid)
       returning id::text`,
      [postId, uid, content, parent]
    )

    await query(
      'update team_posts set comments_count = comments_count + 1 where id = $1::uuid',
      [postId]
    )

    // Вернём подготовленный объект с ролью и профилем
    const one = await query<{
      id: string; post_id: string; user_id: string; content: string;
      parent_id: string | null; created_at: string; updated_at: string;
      username: string | null; avatar_url: string | null; team_role: string | null
    }>(
      `
      select
        c.id::text,
        c.post_id::text,
        c.user_id::text,
        c.content,
        c.parent_id::text,
        c.created_at,
        c.updated_at,
        p.username,
        p.avatar_url,
        m.role as team_role
      from team_post_comments c
      left join profiles p on p.id = c.user_id
      left join translator_team_members m
        on m.team_id = $2 and m.user_id = c.user_id
      where c.id = $1::uuid
      `,
      [ins.rows[0].id, team.id]
    )

    await query('commit')

    return NextResponse.json({ ok: true, item: one.rows[0] })
  } catch (e) {
    await query('rollback').catch(() => {})
    console.error('comments POST error', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

// app/api/teams/[slug]/posts/[postId]/comments/[commentId]/route.ts
export async function DELETE(
  req: NextRequest, 
  { params }: { params: { slug: string; postId: string; commentId: string } }
) {
  try {
    const { slug, postId, commentId } = params
    const team = await resolveTeamBySlug(slug)
    if (!team) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const uid = await getViewerId(req)
    if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    // Проверяем что пост принадлежит команде
    const post = await query(
      'select 1 from team_posts where id = $1::uuid and team_id = $2 limit 1', 
      [postId, team.id]
    )
    if (!post.rowCount) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // Получаем автора комментария
    const c = await query<{ user_id: string }>(
      'select user_id from team_post_comments where id = $1::uuid and post_id = $2::uuid limit 1',
      [commentId, postId]
    )
    if (!c.rowCount) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // Проверяем права: автор комментария или редактор команды
    const isAuthor = c.rows[0].user_id === uid
    const isEditor = await query<{ exists: boolean }>(
      `select exists(
        select 1 from translator_teams where id = $1 and created_by = $2
        union
        select 1 from translator_team_members 
        where team_id = $1 and user_id = $2 and role = any($3::text[])
      ) as exists`,
      [team.id, uid, ['lead', 'leader', 'editor']]
    )

    if (!isAuthor && !isEditor.rows[0]?.exists) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    await query('begin')
    
    // Удаляем комментарий (каскадно удалятся дочерние)
    await query(
      'delete from team_post_comments where id = $1::uuid and post_id = $2::uuid', 
      [commentId, postId]
    )
    
    // Обновляем счетчик комментариев
    await query(
      'update team_posts set comments_count = greatest(comments_count - 1, 0) where id = $1::uuid',
      [postId]
    )
    
    await query('commit')

    return NextResponse.json({ ok: true })
  } catch (e) {
    await query('rollback').catch(() => {})
    console.error('comment DELETE error', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}