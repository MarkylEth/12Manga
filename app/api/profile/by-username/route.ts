// app/api/profile/by-username/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const u = searchParams.get('u');
  if (!u) {
    return NextResponse.json({ ok: false, error: 'u required' }, { status: 400 });
  }

  // ДОБАВИЛИ favorite_genres и ссылки
  const rows = await sql<{
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    created_at: string | null;
    banner_url: string | null;
    favorite_genres: string[] | null;
    telegram: string | null;
    x_url: string | null;
    vk_url: string | null;
    discord_url: string | null;
  }>`
    select
      id,
      username,
      full_name,
      avatar_url,
      bio,
      created_at,
      banner_url,
      favorite_genres,   -- text[]
      telegram,
      x_url,
      vk_url,
      discord_url
    from profiles
    where username = ${u}
    limit 1
  `;

  return NextResponse.json(rows[0] ?? null);
}
