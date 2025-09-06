// app/api/teams/[slug]/member-role/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getViewerId } from '@/lib/auth/route-guards'
import { getMemberRole, isTeamEditor, resolveTeamBySlug } from '../_utils'

type Params = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const slug = params.slug
    const team = await resolveTeamBySlug(slug)
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    // Поддерживаем получение user ID из параметров запроса (для совместимости)
    const { searchParams } = new URL(req.url)
    const userParam = searchParams.get('user')
    
    const uid = userParam || await getViewerId(req)
    if (!uid) {
      // Гость
      return NextResponse.json({ role: 'none', canEdit: false, canPost: false })
    }

    const role = await getMemberRole(team.id, uid)
    const canEdit = await isTeamEditor(team.id, uid)
    
    // Определяем права на постинг: любой участник команды может постить
    const canPost = role !== 'none'

    return NextResponse.json({ role, canEdit, canPost })
  } catch (e) {
    console.error('member-role GET error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}