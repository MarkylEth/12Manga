// lib/auth/route-guards.ts
import type { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser as coreGetAuthUser } from '@/lib/auth'

/* ====================== Types ====================== */
export type AuthUser = {
  id: string
  username: string | null
  email: string | null
  role: 'admin' | 'moderator' | 'user' | string | null
  leaderTeamId: number | null
}

export type GuardFailReason = 'unauthorized' | 'forbidden' | 'no_session'
type GuardOk = { ok: true; status: 200; reason: null; user: AuthUser }
type GuardFail = { ok: false; status: 401 | 403; reason: GuardFailReason; user: AuthUser | null }

/* ====================== Config ====================== */
/** DEV-фолбэк по x-user-id:
 *  - включается, если AUTH_ALLOW_DEV_HEADER=1
 *  - ИЛИ если NODE_ENV !== 'production' (автовключение в dev/test)
 */
const ALLOW_DEV_HEADER_ID =
  String(process.env.AUTH_ALLOW_DEV_HEADER || '').trim() === '1' ||
  (process.env.NODE_ENV !== 'production')

/* ====================== Helpers ====================== */
function isValidUUID(uuid: string): boolean {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return re.test(uuid)
}

/** Пробуем достать UUID из заголовка/куки (только если ALLOW_DEV_HEADER_ID=true) */
async function getViewerIdFromHeaderOrCookie(req?: Request | NextRequest): Promise<string | null> {
  if (!ALLOW_DEV_HEADER_ID) return null

  try {
    const idFromHeader = req?.headers?.get('x-user-id')?.trim()
    if (idFromHeader && isValidUUID(idFromHeader)) return idFromHeader
  } catch {
    // ignore
  }

  try {
    const { cookies } = await import('next/headers')
    const store = await cookies()
    const idFromCookie = store.get('x-user-id')?.value?.trim()
    if (idFromCookie && isValidUUID(idFromCookie)) return idFromCookie
  } catch {
    // ignore (вне контекста маршрута)
  }

  return null
}

/* ====================== Profile helpers ====================== */
export async function getViewerProfile(userId: string) {
  try {
    const r = await query<{
      id: string
      username: string | null
      avatar_url: string | null
      role: string | null
    }>(
      `select id, username, avatar_url, role
         from public.profiles
        where id = $1::uuid
        limit 1`,
      [userId],
    )
    return r.rows?.[0] ?? null
  } catch (e) {
    console.error('[getViewerProfile] error:', e)
    return null
  }
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  const p = await getViewerProfile(userId)
  return (p?.role ?? '').toLowerCase() === 'admin'
}

/* ====================== Core auth ====================== */
/** Безопасно достаём текущего юзера:
 * 1) основная система (`coreGetAuthUser`)
 * 2) DEV-фолбэк по x-user-id (если разрешено)
 * + дочитываем role/username из profiles и leaderTeamId
 */
export async function getAuthUser(req?: Request | NextRequest): Promise<AuthUser | null> {
  let base: any = null

  // 1) пробуем основную авторизацию
  try {
    base = await (coreGetAuthUser as any)(req as any)
  } catch {
    base = null
  }

  // 2) dev-фолбэк
  if (!base?.id) {
    const devId = await getViewerIdFromHeaderOrCookie(req as any)
    if (devId) base = { id: devId }
  }

  if (!base?.id) return null
  const userId = String(base.id)

  // username/role из profiles
  let usernameFromProfile: string | null = null
  let roleFromProfile: string | null = null
  try {
    const prof = await query<{ username: string | null; role: string | null }>(
      `select username, coalesce(role,'user') as role
         from public.profiles
        where id = $1
        limit 1`,
      [userId],
    )
    usernameFromProfile = prof.rows?.[0]?.username ?? null
    roleFromProfile = prof.rows?.[0]?.role ?? null
  } catch {
    // ignore
  }

  // лидерка (если есть)
  let leaderTeamId: number | null = null
  try {
    const t = await query<{ team_id: number }>(
      `select team_id
         from translator_team_members
        where user_id::text = $1 and (is_leader is true or role = 'leader')
        limit 1`,
      [userId],
    )
    if (t.rows?.[0]?.team_id != null) leaderTeamId = Number(t.rows[0].team_id)
  } catch {
    // ignore
  }

  return {
    id: userId,
    username: usernameFromProfile ?? base.username ?? base.name ?? null,
    email: base.email ?? null,
    role: (roleFromProfile ?? base.role ?? 'user') as any,
    leaderTeamId,
  }
}

/** Совместимость со «второй версией» */
export async function getAuthUserWithPermissions(req: Request | NextRequest) {
  const u = await getAuthUser(req)
  if (!u) return null
  const profile = await getViewerProfile(u.id)
  return {
    id: u.id,
    username: profile?.username ?? u.username,
    avatar_url: (profile as any)?.avatar_url ?? null,
    role: profile?.role ?? (u.role as string | null),
    isAdmin: ((profile?.role ?? u.role ?? 'user') as string).toLowerCase() === 'admin',
  }
}

/* ====================== Guards ====================== */
/** Требует любую авторизацию (guard-форма) */
export async function requireLoggedIn(req: Request | NextRequest): Promise<GuardOk | GuardFail> {
  const user = await getAuthUser(req)
  if (!user) return { ok: false, status: 401, reason: 'unauthorized', user: null }
  return { ok: true, status: 200, reason: null, user }
}

/** Требует роль из списка */
export async function requireRole(
  req: Request | NextRequest,
  roles: string[] | string,
): Promise<GuardOk | GuardFail> {
  const allowed = (Array.isArray(roles) ? roles : [roles]).map((r) => String(r).toLowerCase())
  const u = await getAuthUser(req)
  if (!u) return { ok: false, status: 401, reason: 'unauthorized', user: null }

  const role = String(u.role ?? 'user').toLowerCase()
  if (!allowed.includes(role)) return { ok: false, status: 403, reason: 'forbidden', user: u }
  return { ok: true, status: 200, reason: null, user: u }
}

/** Разрешаем по x-api-key либо по роли admin/moderator */
export async function requireUploader(req: Request | NextRequest): Promise<GuardOk | GuardFail> {
  const key = (req.headers as any)?.get?.('x-api-key')?.trim?.() ?? ''
  const allowKey =
    key &&
    (key === (process.env.ADMIN_UPLOAD_KEY || '') ||
      key === (process.env.NEXT_PUBLIC_ADMIN_UPLOAD_KEY || ''))

  if (allowKey) {
    return {
      ok: true,
      status: 200,
      reason: null,
      user: {
        id: 'system',
        username: 'system',
        email: null,
        role: 'admin',
        leaderTeamId: null,
      },
    }
  }
  return requireRole(req, ['admin', 'moderator'])
}

/* ====================== Back-compat API (как было раньше) ====================== */
/** Унифицированно получаем UUID текущего юзера (как в старой версии) */
export async function getViewerId(req: Request | NextRequest): Promise<string | null> {
  const u = await getAuthUser(req)
  return u?.id ?? null
}

/** Требует авторизованного пользователя (как в старой версии) */
export async function requireViewer(req: Request | NextRequest): Promise<string> {
  const id = await getViewerId(req)
  if (!id) throw new Error('UNAUTHORIZED: User ID is required')
  return id
}

/** Совместимость со старым именем */
export async function getAuthUserLegacy(req: Request | NextRequest): Promise<{ id: string } | null> {
  const u = await getAuthUser(req)
  return u ? { id: u.id } : null
}
