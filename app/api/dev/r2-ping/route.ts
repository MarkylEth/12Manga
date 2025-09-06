import { NextResponse } from 'next/server';
import { r2PutBuffer } from '@/lib/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const key = `staging/ping/${Date.now()}.txt`;
    const url = await r2PutBuffer(key, Buffer.from('ok ' + new Date().toISOString()), 'text/plain');
    return NextResponse.json({ ok: true, key, url });
  } catch (err: any) {
    console.error('[r2-ping] error:', err);
    return NextResponse.json({ ok: false, message: String(err?.message || err) }, { status: 500 });
  }
}
