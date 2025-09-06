// app/api/teams/[slug]/route.ts - ИСПРАВЛЕННАЯ ВЕРСИЯ
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getViewerId } from '@/lib/auth/route-guards'
import { resolveTeamBySlug } from './_utils'

type Params = { params: { slug: string } }

/** Профиль команды: базовые поля + подписчики + счётчик участников + флаг «я подписан» */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const uid = await getViewerId(req) // -> string | null
    const team = await resolveTeamBySlug(params.slug)
    
    if (!team) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // Живой подсчёт подписчиков из team_followers
    const followersRes = await query<{ cnt: number }>(
      'SELECT count(*)::int as cnt FROM team_followers WHERE team_id = $1',
      [team.id]
    )
    const followers_count = followersRes.rows[0]?.cnt ?? 0

    // Счётчик участников для бейджа «Команда (N)»
    const membersRes = await query<{ cnt: number }>(
      'SELECT count(*)::int as cnt FROM translator_team_members WHERE team_id = $1',
      [team.id]
    )
    const members_count = membersRes.rows[0]?.cnt ?? 0

    // Проверяем, подписан ли текущий пользователь
    let i_follow = false
    if (uid) {
      const followCheckRes = await query(
        'SELECT 1 FROM team_followers WHERE team_id = $1 AND user_id = $2::uuid LIMIT 1',
        [team.id, uid]
      )
      i_follow = (followCheckRes?.rowCount ?? 0) > 0
    }

    // Обновляем счетчик в основной таблице, если он расходится
    if (team.followers_count !== followers_count) {
      await query(
        'UPDATE translator_teams SET followers_count = $1 WHERE id = $2',
        [followers_count, team.id]
      )
      // Обновляем объект team
      team.followers_count = followers_count
    }

    return NextResponse.json({
      ...team,
      followers_count,
      members_count,
      i_follow,
    })

  } catch (e) {
    console.error('Team GET error:', e)
    return NextResponse.json({ 
      error: 'internal_error',
      message: 'Server error occurred',
      detail: process.env.NODE_ENV === 'development' ? (e instanceof Error ? e.message : String(e)) : undefined
    }, { status: 500 })
  }
}