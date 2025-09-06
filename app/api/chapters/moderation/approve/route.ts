import { NextResponse } from 'next/server';
import { query, withTransaction, getClient } from '@/lib/db';
import { requireRole } from '@/lib/auth/route-guards';
import { listPrefix, moveObject, deletePrefix, toKey } from '@/lib/r2';
import { romajiSlug } from '@/lib/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pad = (n: number, w = 3) => String(n).padStart(w, '0');
const exts = ['webp', 'jpg', 'jpeg', 'png', 'avif'] as const;
const fileBase = (s: string) => s.replace(/^.*\//, '');
const noExt = (s: string) => fileBase(s).replace(/\.[^.]+$/,'');

async function readId(req: Request, ctx?: { params?: { id?: string } }) {
  const fromParams = Number(ctx?.params?.id || 0);
  if (fromParams) return fromParams;
  const body = await req.json().catch(() => ({}));
  return Number(body?.chapterId || 0);
}

export async function POST(req: Request, ctx?: { params: { id: string } }) {
  const guard = await requireRole(req, ['admin','moderator']);
  if (!guard.ok) return NextResponse.json({ ok:false, message:guard.reason }, { status: guard.status });

  const chapterId = await readId(req, ctx);
  if (!chapterId) return NextResponse.json({ ok:false, message:'chapterId required' }, { status:400 });

  // глава
  const chQ = await query(
    `select id, manga_id, chapter_number, volume from chapters where id=$1`,
    [chapterId]
  );
  const ch: any = chQ.rows[0];
  if (!ch) return NextResponse.json({ ok:false, message:'chapter_not_found' }, { status:404 });

  // тайтл
  const mQ = await query(
    `select id, title, title_romaji, original_title,
            (case when exists(select 1 from information_schema.columns
                               where table_schema='public' and table_name='manga' and column_name='slug')
                  then slug else null end) as slug
       from manga where id=$1`,
    [ch.manga_id]
  );
  const m: any = mQ.rows[0];
  if (!m) return NextResponse.json({ ok:false, message:'manga_not_found' }, { status:404 });

  const slug = romajiSlug(m.slug || m.title_romaji || m.original_title || m.title || `manga-${m.id}`) || `manga-${m.id}`;
  const vol = Number(ch.volume ?? 0);
  const num = Number(ch.chapter_number ?? 0);

  const stagingPrefix = `staging/manga/${ch.manga_id}/chapters/${chapterId}/`;
  const finalPrefix   = `manga/${slug}/v${vol}/ch${num}/`;

  // страницы (по порядку)
  const pQ = await query(
    `select id, page_index, image_key, name
       from chapter_pages
      where chapter_id=$1
      order by page_index asc`,
    [chapterId]
  );
  const pages: Array<{ id:number; page_index:number; image_key:string|null; name:string|null }> = pQ.rows as any;

  // листинг staging (чтобы не спамить HEAD'ами)
  const objs = await listPrefix(stagingPrefix);
  const allKeys = objs.map(o => o.Key!).filter(Boolean);
  const keysSet = new Set(allKeys);
  const lowerMap = new Map(allKeys.map(k => [k.toLowerCase(), k]));
  const byBaseNoExt = new Map<string, string[]>();
  for (const k of allKeys) {
    const b = noExt(k).toLowerCase();
    const arr = byBaseNoExt.get(b) || [];
    arr.push(k);
    byBaseNoExt.set(b, arr);
  }

  const guessFromKey = (p: { id:number; page_index:number; image_key:string|null; name:string|null }) => {
    const tried: string[] = [];
    const push = (k: string) => { if (k) tried.push(k); };

    // 1) image_key (url → key)
    if (p.image_key) {
      const k = toKey(p.image_key);
      if (keysSet.has(k)) return { key: k, tried };
      const lk = lowerMap.get(k.toLowerCase()); if (lk) return { key: lk, tried: [...tried, k] };
      push(k);
    }

    // 2) name (может быть без расширения)
    if (p.name && p.name.trim()) {
      const raw = p.name.replace(/^\/+/, '');
      if (/\.[a-z0-9]+$/i.test(raw)) {
        const k = `${stagingPrefix}${raw}`;
        if (keysSet.has(k)) return { key: k, tried };
        const lk = lowerMap.get(k.toLowerCase()); if (lk) return { key: lk, tried: [...tried, k] };
        push(k);
      } else {
        for (const ext of exts) {
          const k = `${stagingPrefix}${raw}.${ext}`;
          if (keysSet.has(k)) return { key: k, tried };
          const lk = lowerMap.get(k.toLowerCase()); if (lk) return { key: lk, tried: [...tried, k] };
          push(k);
        }
        const arr = byBaseNoExt.get(`${stagingPrefix}${raw}`.toLowerCase());
        if (arr && arr.length) return { key: arr[0], tried };
      }
    }

    // 3) по индексу: 001.webp, 1.webp (+все расширения)
    for (const candidate of [pad(p.page_index), String(p.page_index)]) {
      for (const ext of exts) {
        const kk = `${stagingPrefix}${candidate}.${ext}`;
        if (keysSet.has(kk)) return { key: kk, tried };
        const ll = lowerMap.get(kk.toLowerCase()); if (ll) return { key: ll, tried: [...tried, kk] };
        push(kk);
      }
      const arr = byBaseNoExt.get(`${stagingPrefix}${candidate}`.toLowerCase());
      if (arr && arr.length) return { key: arr[0], tried };
    }

    // 4) эвристика: N-й по сортировке
    if (pages.length === allKeys.length && p.page_index-1 >= 0 && p.page_index-1 < allKeys.length) {
      const sorted = [...allKeys].sort((a,b) => fileBase(a).localeCompare(fileBase(b), 'en', { numeric:true, sensitivity:'base' }));
      return { key: sorted[p.page_index-1], tried };
    }

    return { key: '', tried };
  };

  const moved: Array<{pageId:number; from:string; to:string}> = [];
  const skipped: Array<{pageId:number; reason:string; tried:string[]}> = [];

  if (!pages.length) {
    // fallback: переносим всё из staging как есть
    let idx = 1;
    const sorted = [...allKeys].sort((a,b) => fileBase(a).localeCompare(fileBase(b), 'en', { numeric:true, sensitivity:'base' }));
    for (const src of sorted) {
      const toKeyStr = `${finalPrefix}${pad(idx)}.webp`;
      await moveObject(src, toKeyStr);
      moved.push({ pageId: 0, from: src, to: toKeyStr });
      idx++;
    }
  } else {
    for (const p of pages) {
      const name = (p.name && p.name.trim()) || `${pad(p.page_index)}.webp`;
      const toKeyStr = `${finalPrefix}${name}`;
      const { key: fromKey, tried } = guessFromKey(p);

      if (!fromKey) {
        skipped.push({ pageId: p.id, reason: 'source_not_found', tried });
        continue;
      }

      await moveObject(fromKey, toKeyStr);
      await query(`update chapter_pages set image_key=$2, image_url=null where id=$1`, [p.id, toKeyStr]);
      moved.push({ pageId: p.id, from: fromKey, to: toKeyStr });
    }
  }

  // чистим staging
  try { await deletePrefix(stagingPrefix); } catch {}

  // статус -> approved/published + pages_count = фактически перенесённым
  const client = await getClient();
  try {
    await client.query('BEGIN');

    let movedCount = moved.length;
    if (!movedCount) {
      const cntRes = await client.query(
        `select count(*)::int as cnt from chapter_pages where chapter_id=$1`,
        [chapterId]
      );
      movedCount = ((cntRes.rows[0] as any)?.cnt as number) ?? 0;
    }

    const sets: string[] = [
      `review_status='approved'`,
      `status='published'`,
      `updated_at=now()`,
      `published_at=COALESCE(published_at, now())`,
      `pages_count=${movedCount}`,
    ];

    const cols = await client.query(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name='chapters' and column_name in ('approved_by','approved_at')`
    );
    const colNames = (cols.rows as Array<{ column_name: string }>).map(r => r.column_name);
    const hasApprovedBy = colNames.includes('approved_by');

    if (hasApprovedBy) {
      await client.query(`update chapters set ${sets.join(', ')}, approved_by=$2, approved_at=now() where id=$1`, [chapterId, guard.user?.id ?? null]);
    } else {
      await client.query(`update chapters set ${sets.join(', ')} where id=$1`, [chapterId]);
    }

    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    return NextResponse.json({ ok:false, message:'status_update_failed', detail:String(e) }, { status:500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok:true, chapterId, finalPrefix, moved, skipped });
}
