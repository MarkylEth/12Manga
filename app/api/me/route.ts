// app/api/me/route.ts
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/route-guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const me = await getAuthUser();           // ← уже с role из БД
  if (!me) return NextResponse.json({}, { status: 200 });

  const { id, username, email, role, leaderTeamId } = me;
  return NextResponse.json({
    id,
    username: username ?? null,
    email: email ?? null,
    role: role ?? 'user',
    leaderTeamId: leaderTeamId ?? null,
  });
}
