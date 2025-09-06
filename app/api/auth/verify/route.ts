// app/api/auth/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { query } from '@/lib/db';
import { createHash } from 'crypto';

async function consumeFromAuthEmailTokens(tokenHash: string) {
  const res = await query(
    `UPDATE auth_email_tokens
        SET used_at = now()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING email`,
    [tokenHash]
  );
  return res.rows[0]?.email as string | undefined;
}

async function consumeFromAuthTokens(token: string) {
  const res = await query(
    `UPDATE auth_tokens
        SET used_at = now()
      WHERE token = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING email`,
    [token]
  );
  return res.rows[0]?.email as string | undefined;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 });
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    let email = await consumeFromAuthEmailTokens(tokenHash);
    if (!email) email = await consumeFromAuthTokens(token);

    if (!email) {
      return NextResponse.json({ ok: false, error: 'invalid_or_expired' }, { status: 400 });
    }

    // создаём пользователя, если нет; ставим email_verified_at
    const inserted = await query(
      `INSERT INTO users (email, email_verified_at)
         VALUES ($1, now())
       ON CONFLICT (email) DO UPDATE SET
         email_verified_at = COALESCE(users.email_verified_at, now())
       RETURNING id`,
      [email]
    );
    const uid = inserted.rows[0].id as string;

    const base = process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`;
    return NextResponse.redirect(`${base}/auth/verified?uid=${uid}`);
  } catch (e: any) {
    console.error('VERIFY ERROR:', e);
    return NextResponse.json({ ok: false, code: e?.code, message: e?.message ?? 'internal' }, { status: 500 });
  }
}
 