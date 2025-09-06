// app/api/auth/google/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { createHash, randomBytes } from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

function b64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function exchangeCode(input: {
  code: string; client_id: string; client_secret: string; redirect_uri: string; code_verifier: string;
}) {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.client_id,
    client_secret: input.client_secret,
    redirect_uri: input.redirect_uri,
    grant_type: 'authorization_code',
    code_verifier: input.code_verifier,
  });

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Google token error: ${r.status} ${await r.text()}`);
  return r.json() as Promise<{ id_token: string; access_token: string; refresh_token?: string; expires_in: number }>;
}

async function createSession(userId: string) {
  const token = b64url(randomBytes(48));
  const tokenHash = createHash('sha256').update(token).digest('hex');

  await query(
    `insert into sessions (user_id, token_hash, created_at, expires_at)
     values ($1, $2, now(), now() + interval '30 days')`,
    [userId, tokenHash]
  );

  return token;
}

export async function GET(req: NextRequest) {
  try {
    const origin =
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      req.nextUrl.origin;

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${origin}/api/auth/google/callback`;

    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) throw new Error(`Google returned error: ${error}`);
    if (!code || !state) throw new Error('Missing code/state');

    const { rows } = await query(
      `select code_verifier, nonce, coalesce(redirect_to, '/') as redirect_to
       from oauth_states where state = $1`,
      [state]
    );
    if (rows.length === 0) throw new Error('Invalid or expired state');

    const { code_verifier, nonce, redirect_to } = rows[0];

    const tok = await exchangeCode({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier,
    });

    const { payload } = await jwtVerify(tok.id_token, GOOGLE_JWKS, {
      issuer: 'https://accounts.google.com',
      audience: clientId,
      nonce,
    });

    const sub = String(payload.sub);
    const email = String(payload.email ?? '');
    const emailVerified = Boolean(payload.email_verified);
    const name = payload.name ? String(payload.name) : null;
    const picture = payload.picture ? String(payload.picture) : null;

    if (!email || !emailVerified) throw new Error('Google did not return a verified email');

    // upsert user
    const upsertUserSql = `
      insert into users (email, full_name, avatar_url, google_sub, created_at)
      values ($1, $2, $3, $4, now())
      on conflict (email) do update
        set full_name = coalesce(users.full_name, excluded.full_name),
            avatar_url = coalesce(excluded.avatar_url, users.avatar_url),
            google_sub = excluded.google_sub
      returning id
    `;
    const u = await query(upsertUserSql, [email, name, picture, sub]);
    const userId: string = u.rows[0].id;

    // ensure profile
    await query(
      `insert into profiles (user_id, nickname, avatar_url, created_at)
       values ($1, $2, $3, now())
       on conflict (user_id) do update
         set avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url)`,
      [userId, name ?? email.split('@')[0], picture]
    );

    const sessionToken = await createSession(userId);

    await query(`delete from oauth_states where state = $1`, [state]);

    const res = NextResponse.redirect(redirect_to || '/');

    // secure=false если у тебя HTTP (как на 25.46.32.16:3008), иначе кука не установится
    const secure = origin.startsWith('https://');
    res.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (e: any) {
    console.error('Google callback error:', e);
    return NextResponse.redirect(`/auth?error=${encodeURIComponent(e.message ?? 'oauth_failed')}`);
  }
}
