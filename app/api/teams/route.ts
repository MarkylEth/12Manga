// app/api/teams/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function slugify(s: string) {
  const map: Record<string, string> = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',
    о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',
    э:'e',ю:'yu',я:'ya'
  };
  return s.toLowerCase().split('').map(ch => map[ch] ?? ch).join('')
    .replace(/[^a-z0-9-_]+/g, '-').replace(/-{2,}/g, '-').replace(/(^-|-$)/g, '');
}

export async function POST(req: Request) {
    try {
      // ===== AUTH =====
      const cookieStore = await cookies(); // <— тут ждём
      const cookie = cookieStore.get(SESSION_COOKIE)?.value ?? '';
      const payload = await verifySession(cookie).catch(() => null);
      const userId = payload?.sub;
      if (!userId) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      }
  
      // ===== BODY =====
      const body = await req.json().catch(() => ({} as any));
      const name: string = String(body.name || '').trim();
      let slug: string = String(body.slug || '').trim();
      const bio: string | null = body.bio?.trim?.() || null;
  
      const langs: string[] = Array.isArray(body.langs) ? body.langs.map(String) : [];
      const tags: string[] = Array.isArray(body.tags) ? body.tags.map(String) : [];
  
      const discord_url: string | null  = body.discord_url?.trim?.()  || null;
      const boosty_url: string | null   = body.boosty_url?.trim?.()   || null;
      const telegram_url: string | null = body.telegram_url?.trim?.() || null;
      const vk_url: string | null       = body.vk_url?.trim?.()       || null;
  
      if (!name) return NextResponse.json({ ok:false, error:'name_required' }, { status:400 });
      slug = slug ? slugify(slug) : slugify(name);
      if (!slug) return NextResponse.json({ ok:false, error:'slug_required' }, { status:400 });
  
      // ===== UNIQUE SLUG CHECK =====
      const exists = await query(
        `select 1 from translator_teams where lower(btrim(slug)) = lower(btrim($1)) limit 1`,
        [slug],
      );
      if (exists.rowCount) {
        return NextResponse.json({ ok:false, error:'slug_exists' }, { status:409 });
      }
  
      // ===== INSERT =====
      const ins = await query(
        `insert into translator_teams
          (name, slug, bio, langs, tags, discord_url, boosty_url, telegram_url, vk_url, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning id, slug`,
        [name, slug, bio, langs, tags, discord_url, boosty_url, telegram_url, vk_url, userId],
      );
  
      return NextResponse.json({ ok:true, team: ins.rows[0] });
    } catch (e: any) {
      console.error('[api/teams] POST error', e);
      return NextResponse.json({ ok:false, error:'server_error', detail:e?.message }, { status:500 });
    }
  }
  