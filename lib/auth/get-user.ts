// lib/auth/get-user.ts
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from './session';
import { query } from '@/lib/db';

/** Возвращает { id, username, role, leaderTeamId } или null. Готово к Next 15 (await cookies()). */
export async function getAuthUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  const payload = await verifySession(token);
  if (!payload?.sub) return null;

  const uid = String(payload.sub);

  // username: подбираем наиболее вероятные поля
  const r = await query<{
    id: string;
    username?: string | null;
    name?: string | null;
    login?: string | null;
    email?: string | null;
    role?: string | null;
  }>(
    `select id,
            coalesce(username, name, login, email) as username,
            coalesce(role, 'user') as role
     from users
     where id = $1
     limit 1`,
    [uid]
  );

  const row = r.rows?.[0];
  if (!row) return null;

  // лидерство команды (если есть такая схема — опционально)
  let leaderTeamId: number | null = null;
  try {
    const lr = await query<{ team_id: number }>(
      `select team_id from team_members
       where user_id = $1 and role in ('leader','owner') limit 1`,
      [uid]
    );
    leaderTeamId = lr.rows[0]?.team_id ?? null;
  } catch {
    leaderTeamId = null;
  }

  return {
    id: uid,
    username: row.username ?? null,
    role: (row.role as any) ?? 'user',
    leaderTeamId,
  };
}
    