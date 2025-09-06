// app/api/profile/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function jserr(e: any, status = 500) {
  return NextResponse.json(
    { ok: false, error: 'internal_error', message: e?.message, code: e?.code, detail: e?.detail, where: e?.where },
    { status }
  );
}

// безопасная основа для username
const baseFrom = (email: string, nickname?: string | null) =>
  (nickname || email?.split('@')[0] || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 20) || 'user';

function nextCandidate(base: string) {
  const n = Math.floor(Math.random() * 10000); // 0000..9999
  return `${base}${n.toString().padStart(4, '0')}`;
}

async function usernameExists(uname: string) {
  const { rows } = await query<{ exists: boolean }>(
    `select exists(select 1 from public.profiles where username = $1) as exists`,
    [uname]
  );
  return !!rows[0]?.exists;
}

// создадим недостающие вещи, но под ТВОЮ схему (id uuid PK + username unique)
async function ensureProfilesBasics() {
  // таблица уже есть — create if not exists безопасен
  await query(`
    create table if not exists public.profiles(
      id uuid primary key,
      username text unique,
      full_name text,
      avatar_url text,
      bio text,
      role text default 'user',
      created_at timestamp with time zone default now(),
      updated_at timestamp with time zone default now(),
      banner_url text,
      about_md text,
      favorite_genres text[],
      telegram text,
      x_url text,
      vk_url text,
      discord_url text
    );
  `);

  // индекс уникальности, если вдруг раньше не ставили
  await query(`create unique index if not exists profiles_username_key on public.profiles(username)`);

  // триггер на updated_at — необязательно, но удобно
  await query(`
    create or replace function public.trg_touch_updated_at() returns trigger as $$
    begin new.updated_at = now(); return new; end; $$ language plpgsql;
  `);
  await query(`
    do $$
    begin
      if not exists (
        select 1 from pg_trigger where tgname = 'profiles_touch_updated_at'
      ) then
        create trigger profiles_touch_updated_at
        before update on public.profiles
        for each row execute procedure public.trg_touch_updated_at();
      end if;
    end $$;
  `);
}

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    await ensureProfilesBasics();

    // 1) если профиль уже есть по id — вернуть
    {
      const r = await query<{ id: string; username: string | null }>(
        `select id, username from public.profiles where id = $1 limit 1`,
        [user.id]
      );
      const row = r.rows[0];
      if (row?.id) {
        const nickname = row.username || baseFrom(user.email, user.nickname);
        return NextResponse.json({
          ok: true,
          user: { id: user.id, email: user.email, registered_at: user.created_at },
          profile: { nickname, role: 'user', avatar_url: null },
        });
      }
    }

    // 2) профиля нет — создаём с уникальным username
    const base = baseFrom(user.email, user.nickname);
    let candidate = base;

    if (await usernameExists(candidate)) {
      for (let i = 0; i < 20; i++) {
        const c = i === 0 ? `${base}1` : nextCandidate(base);
        if (!(await usernameExists(c))) {
          candidate = c;
          break;
        }
      }
      if (await usernameExists(candidate)) {
        candidate = `${base}_${Date.now().toString(36)}`;
      }
    }

    // upsert по id, с защитой от гонки по username
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await query(
          `
          insert into public.profiles (id, username, role)
          values ($1, $2, 'user')
          on conflict (id) do update set
            username = excluded.username,
            updated_at = now()
        `,
          [user.id, candidate]
        );
        break;
      } catch (e: any) {
        if (e?.code === '23505') {
          // конфликт по уникальному username — подберём новый и ретраим
          candidate = nextCandidate(base);
          continue;
        }
        throw e;
      }
    }

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, registered_at: user.created_at },
      profile: { nickname: candidate, role: 'user', avatar_url: null },
    });
  } catch (e: any) {
    console.error('[GET /api/profile]', e);
    return jserr(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id, // ОБЯЗАТЕЛЕН
      full_name,
      avatar_url,
      bio,
      banner_url,
      favorite_genres,
      telegram,
      x_url,
      vk_url,
      discord_url,
    } = body || {};

    if (!id) {
      return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });
    }

    // нормализуем массив
    const fav = Array.isArray(favorite_genres) ? favorite_genres : [];

    const sql = `
      update public.profiles
      set
        full_name = $2,
        avatar_url = $3,
        bio = $4,
        banner_url = $5,
        favorite_genres = $6::text[],
        telegram = $7,
        x_url = $8,
        vk_url = $9,
        discord_url = $10,
        updated_at = now()
      where id = $1
      returning id, username, full_name, avatar_url, bio, banner_url,
                favorite_genres, telegram, x_url, vk_url, discord_url,
                created_at, updated_at
    `;
    const params = [
      id,
      full_name ?? null,
      avatar_url ?? null,
      bio ?? null,
      banner_url ?? null,
      fav,
      telegram ?? null,
      x_url ?? null,
      vk_url ?? null,
      discord_url ?? null,
    ];

    const res = await query(sql, params);
    if (res.rowCount === 0) {
      return NextResponse.json({ ok: false, error: 'profile_not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, profile: res.rows[0] });
  } catch (e: any) {
    console.error('[PATCH /api/profile] ', e?.message || e);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
