// app/api/teams/[slug]/_utils.ts - ОБНОВЛЕННАЯ ВЕРСИЯ
import { query } from '@/lib/db'

export type TeamRow = {
  id: number                    // BIGINT в JS = number
  slug: string | null
  name: string
  created_by: string           // UUID
  created_at: string
  updated_at: string
  bio: string | null
  avatar_url: string | null
  banner_url: string | null
  telegram_url: string | null
  vk_url: string | null
  discord_url: string | null
  boosty_url: string | null
  tags: string[]
  langs: string[]
  likes_count: number
  followers_count: number
  started_at: string | null
  stats_projects: number
  stats_pages: number
  stats_inwork: number
  verified: boolean
  hiring_text: string | null
  hiring_enabled: boolean
}

/** Полная загрузка команды по slug */
export async function resolveTeamBySlug(slug: string): Promise<TeamRow | null> {
  try {
    const r = await query<TeamRow>(
      `
      SELECT
        id, slug, name, created_by, created_at, updated_at,
        bio, avatar_url, banner_url,
        telegram_url, vk_url, discord_url, boosty_url,
        tags, langs,
        likes_count, followers_count,
        started_at,
        stats_projects, stats_pages, stats_inwork,
        verified, hiring_text, hiring_enabled
      FROM translator_teams
      WHERE slug = $1
      LIMIT 1
      `,
      [slug]
    )
    return r.rows[0] ?? null
  } catch (e) {
    console.error('Error resolving team by slug:', e)
    return null
  }
}

/** Состоит ли пользователь в команде */
export async function isTeamMember(teamId: number, userId: string): Promise<boolean> {
  try {
    const r = await query<{ exists: boolean }>(
      `SELECT exists(
         SELECT 1 FROM translator_team_members
         WHERE team_id = $1 AND user_id = $2::uuid
       ) as exists`,
      [teamId, userId]
    )
    return !!r.rows[0]?.exists
  } catch (e) {
    console.error('Error checking team membership:', e)
    return false
  }
}

/** Может ли пользователь редактировать команду */
export async function isTeamEditor(teamId: number, userId: string): Promise<boolean> {
  try {
    // Создатель всегда может
    const created = await query<{ exists: boolean }>(
      `SELECT exists(SELECT 1 FROM translator_teams WHERE id = $1 AND created_by = $2::uuid) as exists`,
      [teamId, userId]
    )
    if (created.rows[0]?.exists) return true

    // Участник с ролью lead, leader или editor
    const r = await query<{ exists: boolean }>(
      `SELECT exists(
         SELECT 1 FROM translator_team_members
         WHERE team_id = $1 AND user_id = $2::uuid 
         AND role = any($3::text[])
       ) as exists`,
      [teamId, userId, ['lead', 'leader', 'editor']]
    )
    return !!r.rows[0]?.exists
  } catch (e) {
    console.error('Error checking team editor permissions:', e)
    return false
  }
}

/** Роль участника */
export async function getMemberRole(teamId: number, userId: string): Promise<string> {
  try {
    // Проверяем создателя
    const created = await query<{ exists: boolean }>(
      `SELECT exists(SELECT 1 FROM translator_teams WHERE id = $1 AND created_by = $2::uuid) as exists`,
      [teamId, userId]
    )
    if (created.rows[0]?.exists) return 'leader'

    // Получаем роль из таблицы участников
    const r = await query<{ role: string }>(
      `SELECT role FROM translator_team_members WHERE team_id = $1 AND user_id = $2::uuid LIMIT 1`,
      [teamId, userId]
    )
    return r.rows[0]?.role ?? 'none'
  } catch (e) {
    console.error('Error getting member role:', e)
    return 'none'
  }
}

/** Может ли пользователь создавать посты */
export async function canCreatePosts(teamId: number, userId: string): Promise<boolean> {
  const role = await getMemberRole(teamId, userId)
  const allowedRoles = ['leader', 'lead', 'editor', 'translator', 'typesetter']
  return allowedRoles.includes(role)
}

/** Может ли пользователь закреплять посты */
export async function canPinPosts(teamId: number, userId: string): Promise<boolean> {
  const role = await getMemberRole(teamId, userId)
  return role === 'leader' || role === 'lead'
}

/** Проверить, подписан ли пользователь на команду */
export async function isUserFollowingTeam(teamId: number, userId: string): Promise<boolean> {
  try {
    console.log('Checking follow status for user:', userId, 'team:', teamId)
    
    const r = await query<{ exists: boolean }>(
      'SELECT exists(SELECT 1 FROM team_followers WHERE team_id = $1 AND user_id = $2::uuid) as exists',
      [teamId, userId]
    )
    
    const isFollowing = r.rows[0]?.exists ?? false
    console.log('Follow check result:', isFollowing)
    
    return isFollowing
  } catch (e) {
    console.error('Error checking follow status:', e)
    return false
  }
}

/** Получить команду с дополнительными данными пользователя */
export async function getTeamWithUserData(slug: string, userId: string | null) {
  console.log('getTeamWithUserData called with:', { slug, userId })
  
  const team = await resolveTeamBySlug(slug)
  if (!team) {
    console.log('Team not found for slug:', slug)
    return null
  }

  // Подсчет подписчиков из team_followers
  const followersRes = await query<{ cnt: number }>(
    'SELECT count(*)::int as cnt FROM team_followers WHERE team_id = $1',
    [team.id]
  )
  const followers_count = followersRes.rows[0]?.cnt ?? 0

  // Подсчет участников из translator_team_members
  const membersRes = await query<{ cnt: number }>(
    'SELECT count(*)::int as cnt FROM translator_team_members WHERE team_id = $1',
    [team.id]
  )
  const members_count = membersRes.rows[0]?.cnt ?? 0

  let i_follow = false
  let user_role = 'none'
  let can_post = false
  let can_edit = false
  let can_pin = false

  if (userId) {
    console.log('Checking user data for:', userId, 'team:', team.id)
    
    // Проверяем подписку
    i_follow = await isUserFollowingTeam(team.id, userId)
    console.log('User follow status:', i_follow)

    // Получаем роль и права
    user_role = await getMemberRole(team.id, userId)
    can_post = await canCreatePosts(team.id, userId)
    can_edit = await isTeamEditor(team.id, userId)
    can_pin = await canPinPosts(team.id, userId)
    
    console.log('User permissions:', { user_role, can_post, can_edit, can_pin })
  }

  // Обновляем счетчик подписчиков в основной таблице, если он отличается
  if (team.followers_count !== followers_count) {
    console.log('Updating followers count in main table:', followers_count)
    await query(
      'UPDATE translator_teams SET followers_count = $1, updated_at = now() WHERE id = $2',
      [followers_count, team.id]
    )
  }

  const result = {
    ...team,
    followers_count,
    members_count,
    i_follow,
    user_role,
    can_post,
    can_edit,
    can_pin,
  }

  console.log('Final team data:', {
    id: result.id,
    name: result.name,
    i_follow: result.i_follow,
    followers_count: result.followers_count
  })

  return result
}

// Совместимость
export { resolveTeamBySlug as resolveTeam }