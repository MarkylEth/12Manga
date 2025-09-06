// app/api/teams/[slug]/posts/[postId]/like/route.ts - ИСПРАВЛЕННАЯ ВЕРСИЯ
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getViewerId } from '@/lib/auth/route-guards'
import { resolveTeamBySlug } from '../../../_utils'

type Params = { params: { slug: string; postId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const team = await resolveTeamBySlug(params.slug)
  if (!team) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const uid = await getViewerId(req)
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Поддерживаем оба варианта payload
  const payload = await req.json().catch(() => ({}))
  const action = payload.action || (payload.like ? 'like' : 'clear')
  
  if (!['like', 'dislike', 'clear'].includes(action)) {
    return NextResponse.json({ error: 'bad_action' }, { status: 400 })
  }

  const postId = params.postId

  try {
    await query('begin')
    
    // Получаем текущий статус лайка
    const cur = await query<{ is_like: boolean }>(
      'select is_like from team_post_likes where post_id=$1::uuid and user_id=$2::uuid for update',
      [postId, uid]
    )

    if (action === 'clear') {
      if (cur.rowCount) {
        const wasLike = cur.rows[0].is_like
        await query('delete from team_post_likes where post_id=$1::uuid and user_id=$2::uuid', [
          postId,
          uid,
        ])
        await query(
          wasLike
            ? 'update team_posts set likes_count = greatest(likes_count-1,0) where id=$1::uuid'
            : 'update team_posts set dislikes_count = greatest(dislikes_count-1,0) where id=$1::uuid',
          [postId]
        )
      }
    } else if (action === 'like') {
      if (!cur.rowCount) {
        await query(
          'insert into team_post_likes (post_id, user_id, is_like) values ($1::uuid,$2::uuid,true)',
          [postId, uid]
        )
        await query('update team_posts set likes_count = likes_count+1 where id=$1::uuid', [postId])
      } else if (cur.rows[0].is_like === false) {
        // switch dislike -> like
        await query(
          'update team_post_likes set is_like=true where post_id=$1::uuid and user_id=$2::uuid',
          [postId, uid]
        )
        await query(
          'update team_posts set likes_count = likes_count+1, dislikes_count = greatest(dislikes_count-1,0) where id=$1::uuid',
          [postId]
        )
      }
    } else if (action === 'dislike') {
      if (!cur.rowCount) {
        await query(
          'insert into team_post_likes (post_id, user_id, is_like) values ($1::uuid,$2::uuid,false)',
          [postId, uid]
        )
        await query('update team_posts set dislikes_count = dislikes_count+1 where id=$1::uuid', [
          postId,
        ])
      } else if (cur.rows[0].is_like === true) {
        // switch like -> dislike
        await query(
          'update team_post_likes set is_like=false where post_id=$1::uuid and user_id=$2::uuid',
          [postId, uid]
        )
        await query(
          'update team_posts set dislikes_count = dislikes_count+1, likes_count = greatest(likes_count-1,0) where id=$1::uuid',
          [postId]
        )
      }
    }

    // Получаем обновленные данные
    const updatedPost = await query<{ likes_count: number; is_liked: boolean }>(
      `select 
        coalesce(likes_count, 0) as likes_count,
        exists(
          select 1 from team_post_likes 
          where post_id = $1::uuid and user_id = $2::uuid and is_like = true
        ) as is_liked
       from team_posts 
       where id = $1::uuid`,
      [postId, uid]
    )

    await query('commit')
    
    return NextResponse.json({ 
      ok: true,
      likesCount: updatedPost.rows[0]?.likes_count || 0,
      likedByViewer: updatedPost.rows[0]?.is_liked || false,
      // Для совместимости со старым форматом
      i_like: updatedPost.rows[0]?.is_liked || false
    })
  } catch (e) {
    await query('rollback').catch(() => {})
    console.error('like route error', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}