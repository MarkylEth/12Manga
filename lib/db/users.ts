import { query } from '@/lib/db';

export type DbUser = {
  id: number;
  email: string;
  password_hash: string;
  nickname: string | null;
  created_at: string;
};

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const sql = `
    SELECT id, email, password_hash, nickname, created_at
    FROM public.site_users
    WHERE lower(email) = lower($1)
    LIMIT 1
  `;
  const { rows } = await query<DbUser>(sql, [email]);
  return rows[0] ?? null;
}

export async function createUser(params: {
  email: string;
  passwordHash: string;
  nickname?: string | null;
}): Promise<DbUser> {
  const sql = `
    INSERT INTO public.site_users (email, password_hash, nickname)
    VALUES ($1, $2, $3)
    RETURNING id, email, password_hash, nickname, created_at
  `;
  const { rows } = await query<DbUser>(sql, [
    params.email,
    params.passwordHash,
    params.nickname ?? null,
  ]);
  return rows[0];
}
