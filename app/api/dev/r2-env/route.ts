import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const e = process.env;
  return NextResponse.json({
    R2_ACCOUNT_ID: !!e.R2_ACCOUNT_ID,
    R2_BUCKET: !!e.R2_BUCKET,
    R2_ACCESS_KEY_ID: !!e.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: !!e.R2_SECRET_ACCESS_KEY,
    R2_PUBLIC_BASE: !!e.R2_PUBLIC_BASE,
    R2_ENDPOINT: e.R2_ENDPOINT || '(default)',
    R2_TLS: e.R2_TLS || '(12)',
    R2_HTTP2: e.R2_HTTP2 || '0',
    R2_INSECURE: e.R2_INSECURE || 'false',
    R2_IPV4FIRST: e.R2_IPV4FIRST || 'true',
  });
}
