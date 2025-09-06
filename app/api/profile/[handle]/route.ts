// app/api/profile/[handle]/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db'; // твой helper для NEON

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { handle: string } }
) {
  const handle = decodeURIComponent(params.handle || '').trim();
  if (!handle) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  try {
    // Берём первую подходящую запись
    const { rows } = await query(
      `select * from public.profiles
       where lower(username) = lower($1)
       limit 1`,
      [handle]
    );

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ ok: true, data: null });
    }

    // Нормализуем под интерфейс, который ждёт страница
    const data = {
      id: String(row.id),
      username: row.username ?? handle,
      full_name: row.full_name ?? null,
      avatar_url: row.avatar_url ?? null,
      bio: row.bio ?? null,
      created_at: row.created_at ?? null,
      banner_url: row.banner_url ?? null,

      // Эти полей может не быть в схеме — вернём null, если их нет
      favorite_genres: Array.isArray(row.favorite_genres) ? row.favorite_genres : null,
      telegram: row.telegram ?? null,
      x_url: row.x_url ?? null,
      vk_url: row.vk_url ?? null,
      discord_url: row.discord_url ?? null,
    };

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[GET /api/profile/[handle]]', e);
    return NextResponse.json(
      { ok: false, error: 'internal_error', message: e?.message },
      { status: 500 }
    );
  }
}
