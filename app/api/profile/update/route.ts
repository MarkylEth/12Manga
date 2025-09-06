import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const {
      id, username, full_name, avatar_url, bio, banner_url,
      favorite_genres, telegram, x_url, vk_url, discord_url,
    } = body;

    if (!id) return NextResponse.json({ error: 'no id' }, { status: 400 });
    if (!/^[a-z0-9_]{3,20}$/.test(username ?? ''))
      return NextResponse.json({ error: 'bad username' }, { status: 400 });

    // проверка уникальности ника
    const dupe = await query(
      'select 1 from public.profiles where lower(username)=lower($1) and id <> $2::uuid limit 1',
      [username, id]
    );
    if (dupe.rowCount) return NextResponse.json({ error: 'username_taken' }, { status: 409 });

    // обновление
    await query(
      `update public.profiles
         set username=$2,
             full_name=$3, avatar_url=$4, bio=$5, banner_url=$6,
             favorite_genres=$7, telegram=$8, x_url=$9, vk_url=$10, discord_url=$11
       where id=$1`,
      [id, username, full_name, avatar_url, bio, banner_url,
       favorite_genres, telegram, x_url, vk_url, discord_url]
    );

    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
