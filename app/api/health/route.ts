// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifySmtp } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dbOk = await query('select 1 as x').then(() => true).catch(() => false);
    const smtp  = await verifySmtp(5000);

    return NextResponse.json({
      time: new Date().toISOString(),
      uptime_s: Math.floor(process.uptime()),
      db: { ok: dbOk },
      smtp,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
