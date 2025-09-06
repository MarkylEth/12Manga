// lib/auth/session.ts
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'

/** Имя cookie сессии (оставил прежнее, если у вас уже было другое — верните своё) */
export const SESSION_COOKIE = 'mp_session'

/** Полезная нагрузка токена сессии */
export type SessionPayload = {
  sub: string
  email?: string | null
  name?: string | null
  role?: 'guest' | 'user' | 'team' | 'moderator' | 'admin'
  iat?: number
  exp?: number
}

/* ========================= crypto helpers ========================= */

const ALG = 'HS256'

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET
  if (!secret) {
    throw new Error(
      'SESSION_SECRET (или JWT_SECRET) не задан. Укажите его в .env'
    )
  }
  return new TextEncoder().encode(secret)
}

/** Подпись JWT для сессии (на случай, если где-то создаётся) */
export async function signSession(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
  maxAgeSec = 60 * 60 * 24 * 30 // 30 дней
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + maxAgeSec)
    .sign(getSecret())
}

/** Проверка/декодирование токена сессии */
export async function verifySession(
  token?: string | null
): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

/* ========================= cookie helpers ========================= */

/**
 * Автовыбор флага secure для cookie.
 * - Если явно задано COOKIE_SECURE=true/false — берём его.
 * - Иначе в production считаем secure только если SITE_URL/NEXT_PUBLIC_SITE_URL начинается с https.
 * - В dev — не secure, чтобы работало по http.
 */
const SECURE_COOKIE: boolean = (() => {
  const v = (process.env.COOKIE_SECURE ?? '').toLowerCase().trim()
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false

  const site =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_URL ||
    ''
  const onHttps = /^https:\/\//i.test(site)
  return process.env.NODE_ENV === 'production' ? onHttps : false
})()

/** Поставить cookie сессии */
export function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE_COOKIE, // <-- ключевая правка
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 дней
  })
}

/** Стереть cookie сессии */
export function clearSessionCookie() {
  // Удаляем с теми же атрибутами, что ставили
  cookies().set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE_COOKIE, // <-- ключевая правка
    path: '/',
    maxAge: 0,
  })
}
