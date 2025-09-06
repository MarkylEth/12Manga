// src/lib/auth/server.ts
import 'server-only';
import { NextRequest } from 'next/server';
import { cookies as getCookies } from 'next/headers';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/db';

const COOKIE_SESSION = 'session_token';                         // наша серверная сессия
const JWT_COOKIE_CANDIDATES = ['auth_token','mp_jwt','jwt','access_token','token']; // ваши/типовые имена

type CookieSetOpts = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  expires?: Date;
};

// ===== helpers для cookies (Next 15)
async function store(): Promise<any> { return await (getCookies as any)(); }
async function setCookie(name: string, value: string, opts: CookieSetOpts) {
  const s = await store(); if (s?.set) s.set({ name, value, ...opts });
}
async function getCookie(name: string) {
  const s = await store(); return s?.get ? s.get(name) : undefined;
}

function shouldUseSecure(req?: NextRequest | Request) {
  const fwd = (req as NextRequest | undefined)?.headers?.get?.('x-forwarded-proto');
  if (fwd === 'https') return true;
  const u = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || process.env.SITE_URL || '';
  return u.startsWith('https://');
}

/* ========== SESSION API (DB sessions) ========== */
export async function createSession(userId: string, req?: NextRequest | Request) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30*24*60*60*1000);
  await query(`insert into sessions (user_id, token, expires_at) values ($1,$2,$3)`, [userId, token, expires]);
  await setCookie(COOKIE_SESSION, token, {
    httpOnly: true, secure: shouldUseSecure(req), sameSite: 'lax', path: '/', expires,
  });
}

export async function destroySession(req?: NextRequest | Request) {
  const c = await getCookie(COOKIE_SESSION);
  if (c?.value) await query(`delete from sessions where token = $1`, [c.value]);
  await setCookie(COOKIE_SESSION, '', {
    httpOnly: true, secure: shouldUseSecure(req), sameSite: 'lax', path: '/', expires: new Date(0),
  });
}

async function getUserIdFromSessionCookie(): Promise<string | null> {
  const c = await getCookie(COOKIE_SESSION);
  if (!c?.value) return null;
  const r = await query<{ user_id: string }>(
    `select user_id from sessions where token=$1 and expires_at>now() limit 1`, [c.value]
  );
  return r.rows[0]?.user_id ?? null;
}

/* ========== JWT fallback (cookies + Authorization) ========== */
function parseJwt(token: string) {
  try { return process.env.JWT_SECRET ? jwt.verify(token, process.env.JWT_SECRET) : jwt.decode(token); }
  catch { return null; }
}
function pickUserId(p: any): string | null {
  const cand = p?.sub ?? p?.userId ?? p?.user_id ?? p?.uid ?? p?.id ?? p?.user?.id;
  return cand != null ? String(cand) : null;
}

async function getUserIdFromJwtCookies(): Promise<string | null> {
  const s = await store(); if (!s?.getAll) return null;

  // 1) известные имена
  for (const name of JWT_COOKIE_CANDIDATES) {
    const v = s.get(name)?.value; if (!v) continue;
    const id = pickUserId(parseJwt(v)); if (id) return id;
  }

  // 2) «любой похожий на JWT»
  for (const c of s.getAll()) {
    if (typeof c.value !== 'string' || c.value.split('.').length !== 3) continue;
    const id = pickUserId(parseJwt(c.value)); if (id) return id;
  }
  return null;
}

function getBearer(req?: NextRequest | Request): string | null {
  const h: any = (req as any)?.headers;
  const raw = h?.get?.('authorization') || h?.Authorization || h?.authorization;
  const m = typeof raw === 'string' ? raw.match(/^Bearer\s+(.+)$/i) : null;
  return m ? m[1] : null;
}

/* ========== Unified API ========== */
export async function getUserIdFromRequest(req?: NextRequest | Request): Promise<string | null> {
  // 1) обычная server-session
  const sid = await getUserIdFromSessionCookie();
  if (sid) return sid;

  // 2) Authorization: Bearer <JWT>
  const bearer = getBearer(req);
  if (bearer) {
    const id = pickUserId(parseJwt(bearer));
    if (id) return id;
  }

  // 3) JWT в куках
  return await getUserIdFromJwtCookies();
}

export async function getAuthUser(req?: NextRequest | Request) {
  const id = await getUserIdFromRequest(req);
  return id ? { id } : null;
}
