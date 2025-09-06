// app/api/teams/[slug]/members/route.ts - ПРАВИЛЬНАЯ ВЕРСИЯ
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getViewerId } from '@/lib/auth/route-guards'
import { resolveTeamBySlug, isTeamEditor } from '../_utils'

type Params = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    console.log('Getting members for team slug:', params.slug)
    
    const team = await resolveTeamBySlug(params.slug)
    if (!team) {
      console.log('Team not found for slug:', params.slug)
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    console.log('Found team:', team.id, team.name)

    const r = await query<{
      user_id: string
      role: string
      username: string | null
      avatar_url: string | null
      added_at: string
    }>(
      `
      select 
        m.user_id::text, 
        m.role,
        m.added_at,
        p.username, 
        p.avatar_url
      from translator_team_members m
      left join profiles p on p.id = m.user_id
      where m.team_id = $1
      order by
        case m.role
          when 'leader' then 0
          when 'owner'  then 1
          when 'lead'   then 2
          when 'editor' then 3
          when 'translator' then 4
          when 'typesetter' then 5
          when 'member' then 6
          else 7
        end,
        m.added_at asc,
        coalesce(p.username, '') asc
      `,
      [team.id]
    )

    console.log('Raw members query result:', r.rows)

    const items = r.rows.map((x) => ({
      user_id: x.user_id,
      role: x.role,
      added_at: x.added_at,
      profile: {
        id: x.user_id,
        username: x.username,
        avatar_url: x.avatar_url,
      }
    }))

    console.log('Processed members:', items)

    return NextResponse.json({ items, count: items.length })
  } catch (e) {
    console.error('members GET error', e)
    return NextResponse.json({ 
      error: 'Internal error',
      detail: e instanceof Error ? e.message : String(e)
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    console.log('Updating members for team slug:', params.slug)
    
    const team = await resolveTeamBySlug(params.slug)
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    const uid = await getViewerId(req)
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const canEdit = await isTeamEditor(team.id, uid)
    if (!canEdit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { members } = await req.json().catch(() => ({ members: [] }))
    
    if (!Array.isArray(members)) {
      return NextResponse.json({ error: 'Invalid members data' }, { status: 400 })
    }

    console.log('Received members data:', members)

    await query('begin')
    
    try {
      // Получаем создателя команды
      const creatorResult = await query<{ created_by: string }>(
        'select created_by from translator_teams where id = $1',
        [team.id]
      )
      
      const creator = creatorResult.rows[0]?.created_by
      console.log('Team creator:', creator)

      // Удаляем всех текущих участников (кроме создателя)
      if (creator) {
        await query(
          `delete from translator_team_members 
           where team_id = $1 and user_id != $2::uuid`,
          [team.id, creator]
        )
      } else {
        await query(
          `delete from translator_team_members where team_id = $1`,
          [team.id]
        )
      }

      // Добавляем новых участников
      for (const member of members) {
        const username = member.username?.trim()
        const role = member.role?.trim()
        
        console.log('Processing member:', username, role)
        
        if (!username || !role) {
          console.log('Skipping member with empty username or role')
          continue
        }
        
        // Ищем пользователя по username
        const userResult = await query<{ id: string }>(
          'select id from profiles where username = $1 limit 1',
          [username]
        )
        
        if (userResult.rows[0]) {
          const userId = userResult.rows[0].id
          console.log('Found user:', userId, 'for username:', username)
          
          // Если это создатель команды, не добавляем его в участники
          if (userId === creator) {
            console.log('Skipping creator as member')
            continue
          }
          
          await query(
            `insert into translator_team_members (team_id, user_id, role, added_at)
             values ($1, $2::uuid, $3, now())
             on conflict (team_id, user_id) do update set 
               role = excluded.role, 
               added_at = now()`,
            [team.id, userId, role]
          )
          console.log('Added/updated member:', username, role)
        } else {
          console.log('User not found for username:', username)
        }
      }

      await query('commit')
      console.log('Members update completed successfully')

      // Возвращаем обновленный список
      const r = await query<{
        user_id: string
        role: string
        username: string | null
        avatar_url: string | null
        added_at: string
      }>(
        `select 
           m.user_id::text, 
           m.role, 
           m.added_at,
           p.username, 
           p.avatar_url
         from translator_team_members m
         left join profiles p on p.id = m.user_id
         where m.team_id = $1
         order by
           case m.role
             when 'leader' then 0
             when 'owner' then 1
             when 'lead' then 2
             when 'editor' then 3
             when 'translator' then 4
             when 'typesetter' then 5
             else 6
           end,
           m.added_at asc,
           coalesce(p.username, '') asc`,
        [team.id]
      )

      const items = r.rows.map((x) => ({
        user_id: x.user_id,
        role: x.role,
        added_at: x.added_at,
        profile: {
          id: x.user_id,
          username: x.username,
          avatar_url: x.avatar_url,
        }
      }))

      console.log('Final members list:', items)

      return NextResponse.json({ ok: true, items })
    } catch (e) {
      await query('rollback')
      console.error('Transaction failed, rolled back:', e)
      throw e
    }
  } catch (e) {
    console.error('members POST error', e)
    return NextResponse.json({ 
      error: 'Internal error',
      detail: e instanceof Error ? e.message : String(e)
    }, { status: 500 })
  }
}