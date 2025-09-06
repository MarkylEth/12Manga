// app/api/auth/google/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';

function b64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}
function sha256b64url(s: string) {
  return b64url(crypto.createHash('sha256').update(s).digest());
}

export async function GET(req: NextRequest) {
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    req.nextUrl.origin;

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const redirectTo = req.nextUrl.searchParams.get('redirect_to') ?? '/';

  const codeVerifier = b64url(crypto.randomBytes(32));
  const codeChallenge = sha256b64url(codeVerifier);
  const state = b64url(crypto.randomBytes(16));
  const nonce = b64url(crypto.randomBytes(16));

  await query(
    `insert into oauth_states (state, code_verifier, nonce, redirect_to)
     values ($1,$2,$3,$4)`,
    [state, codeVerifier, nonce, redirectTo]
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent'
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
