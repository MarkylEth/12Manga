import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/route-guards';

export const runtime = 'nodejs';

export async function GET() {
  const u = await getAuthUser();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, ...u });
}
