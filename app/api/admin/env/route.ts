// app/api/admin/env/route.ts
import { NextResponse } from 'next/server'

/** GET: отдать безопасный срез окружения для админки (без секретов!) */
export async function GET() {
  const safe = {
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    node: process.version,
    databaseUrlSet: Boolean(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL),
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    // public only:
    publicBaseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? null,
  }
  return NextResponse.json({ ok: true, env: safe })
}
