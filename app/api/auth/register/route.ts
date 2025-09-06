// app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { query } from '@/lib/db';
import { sendVerificationEmail, verifySmtp } from '@/lib/mail';
import { randomBytes, createHash } from 'crypto';
import { hashPassword } from '@/lib/hash';

type ReqBody = {
  email?: string;
  mode?: 'signup' | 'signin' | string;
  name?: string;       // никнейм (желательно)
  password?: string;   // сырой пароль
};

function getBaseUrl(req: Request) {
  const xfProto = req.headers.get('x-forwarded-proto');
  const xfHost  = req.headers.get('x-forwarded-host');
  const host    = xfHost || req.headers.get('host');
  const proto   = xfProto || 'http';
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`;
}

let ensured = false;
async function ensureAuthSchemaOnce() {
  if (ensured) return;

  await query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS public.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE NOT NULL,
      name  text,
      password_hash   text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      email_verified_at timestamptz
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS public.auth_email_tokens (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS auth_email_tokens_token_hash_idx ON public.auth_email_tokens(token_hash);`);
  await query(`CREATE INDEX IF NOT EXISTS auth_email_tokens_email_idx      ON public.auth_email_tokens(email);`);

  await query(`
  CREATE TABLE IF NOT EXISTS public.auth_tokens (
    id BIGSERIAL PRIMARY KEY,
    token TEXT NOT NULL,
    email TEXT NOT NULL,
    type TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

  // === PROFILES: приводим к схеме с username и автосозданием ===
  await query(`
    CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
      username   text NOT NULL,
      full_name  text,
      avatar_url text,
      bio        text,
      role       text DEFAULT 'user',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (lower(username));`);

  // убираем любые старые триггеры на users, которые трогают profiles
  await query(`
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_schema='public'
          AND event_object_table='users'
          AND action_statement ILIKE '%profiles%'
      LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.users;', t.trigger_name);
      END LOOP;
    END $$;
  `);

  // новая безопасная функция: всегда пишет username (из name или из локальной части email)
  await query(`
    CREATE OR REPLACE FUNCTION public.ensure_profile_username()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE nick text;
    BEGIN
      nick := COALESCE(NULLIF(NEW.name,''), split_part(NEW.email,'@',1), 'user_'||substr(NEW.id::text,1,8));

      BEGIN
        INSERT INTO public.profiles (id, username, full_name)
        VALUES (NEW.id, nick, COALESCE(NULLIF(NEW.name,''), nick))
        ON CONFLICT (id) DO UPDATE
          SET username = EXCLUDED.username,
              full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
      EXCEPTION WHEN unique_violation THEN
        -- если занято (уникальный username), добавим короткий суффикс
        INSERT INTO public.profiles (id, username, full_name)
        VALUES (NEW.id, nick || '_' || substr(md5(random()::text),1,4), COALESCE(NULLIF(NEW.name,''), nick))
        ON CONFLICT (id) DO UPDATE
          SET username = EXCLUDED.username,
              full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
      END;

      RETURN NEW;
    END $$;
  `);
  await query(`DROP TRIGGER IF EXISTS users_after_insert_profile ON public.users;`);
  await query(`CREATE TRIGGER users_after_insert_profile
               AFTER INSERT ON public.users
               FOR EACH ROW EXECUTE FUNCTION public.ensure_profile_username();`);

  ensured = true;
}

async function storeEmailToken(email: string, token: string, tokenHash: string, ttlHours = 24) {
  try {
    await query(
      `INSERT INTO public.auth_email_tokens (email, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' hours')::interval)`,
      [email, tokenHash, String(ttlHours)]
    );
    return { table: 'auth_email_tokens' as const };
  } catch (e: any) {
    if (e?.code !== '42P01') throw e;
  }
  await query(
    `INSERT INTO public.auth_tokens (token, email, type, expires_at)
     VALUES ($1, $2, 'email_verify', now() + ($3 || ' hours')::interval)`,
    [token, email, String(ttlHours)]
  );
  return { table: 'auth_tokens' as const };
}

export async function POST(req: NextRequest) {
  try {
    const usingMailerSend = !!process.env.MAILERSEND_API_TOKEN && !!process.env.MAILERSEND_FROM_EMAIL;
    const usingResend     = !!process.env.RESEND_API_KEY;
    const usingSmtp       = !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
    if (!(usingMailerSend || usingResend || usingSmtp)) {
      return NextResponse.json({ ok:false, error:'email_provider_not_configured' }, { status: 500 });
    }

    await ensureAuthSchemaOnce();

    // parse
    let body: ReqBody = {};
    try { body = await req.json(); }
    catch { return NextResponse.json({ ok:false, error:'bad_json' }, { status: 400 }); }

    const email = String(body?.email || '').trim().toLowerCase();
    const mode  = (body?.mode as 'signup' | 'signin' | string) || 'signup';
    const name  = (body?.name || '').trim() || null;
    const pwd   = (body?.password || '').trim() || null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok:false, error:'bad_email' }, { status: 400 });
    }
    if (mode === 'signup' && pwd && pwd.length < 6) {
      return NextResponse.json({ ok:false, error:'weak_password' }, { status: 400 });
    }

    // токен подтверждения
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // апсерт пользователя (ВСЕГДА), триггер создаст/обновит профиль с username
    const pwdHash = pwd ? await hashPassword(pwd) : null;
    await query(
      `INSERT INTO public.users (email, name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, public.users.name),
         password_hash = COALESCE(EXCLUDED.password_hash, public.users.password_hash)`,
      [email, name, pwdHash]
    );

    // сохраняем email-токен
    const dest = await storeEmailToken(email, token, tokenHash, 24);

    // отправка письма
    const base = getBaseUrl(req);
    const link = `${base}/api/auth/verify?token=${encodeURIComponent(token)}`;

    const vr = await verifySmtp();
    if (!vr.ok) {
      return NextResponse.json({ ok:false, error:'smtp_verify_failed', detail:(vr as any).error }, { status: 502 });
    }
    const sent = await sendVerificationEmail(email, link, mode);
    if (!sent.ok) {
  const provider = usingMailerSend ? 'mailersend' : usingResend ? 'resend' : 'smtp';
  return NextResponse.json(
    { ok:false, error: `${provider}_error`, provider, detail: (sent as any).error },
    { status: 502 }
  );
}

    return NextResponse.json({ ok:true, table: dest.table });
  } catch (e: any) {
    console.error('[register] fatal:', e);
    return NextResponse.json({ ok:false, error:'internal', message:e?.message }, { status: 500 });
  }
}
