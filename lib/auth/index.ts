// lib/auth/index.ts
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/db';

const SESSION_NAME = process.env.SESSION_NAME || 'mp_session';

export async function getAuthUser() {
  const ck = cookies();
  const token = ck.get(SESSION_NAME)?.value;        // <-- то же имя
  if (!token) return null;

  let payload: any;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    return null;
  }

  const { rows } = await query(
    `select id::text, email, created_at from users where id=$1 limit 1`,
    [payload.sub]
  );
  return rows[0] || null;
}
