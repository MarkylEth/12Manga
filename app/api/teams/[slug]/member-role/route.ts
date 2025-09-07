// app/api/teams/[slug]/member-role/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getViewerId } from '@/lib/auth/route-guards'
import { getMemberRole, isTeamEditor, resolveTeamBySlug } from '../_utils'
import { query } from '@/lib/db' // ← добавь импорт

type Params = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const slug = params.slug
    const team = await resolveTeamBySlug(slug)
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    const { searchParams } = new URL(req.url)
    const userParam = searchParams.get('user')
    const uid = userParam || await getViewerId(req)

    if (!uid) {
      // Гость
      return NextResponse.json({ role: 'none', canEdit: false, canPost: false, profile: null })
    }

    const role = await getMemberRole(team.id, uid)
    const canEdit = await isTeamEditor(team.id, uid)
    const canPost = role !== 'none'

    // ВАЖНО: тянем профиль из БД
    const prof = await query<{ username: string | null; avatar_url: string | null }>(
      `select username, avatar_url
         from profiles
        where id = $1::uuid
        limit 1`,
      [uid]
    )
    const profile = prof.rows[0] ?? { username: null, avatar_url: null }

    return NextResponse.json({ role, canEdit, canPost, profile })
  } catch (e) {
    console.error('member-role GET error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
