// app/api/envcheck/route.ts
import { NextResponse } from 'next/server'

/**
 * GET /api/envcheck
 * Лёгкий health‑endpoint с безопасным срезом окружения.
 */
export async function GET() {
  const env = {
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    node: process.version,
    databaseUrlSet: Boolean(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL),
    publicBaseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? null,
  }
  return NextResponse.json({ ok: true, env })
}
