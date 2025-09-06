// /api/admin/title-submissions/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ---------------- helpers ---------------- */

function toStrList(v: any): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof v === 'string') {
    try { const j = JSON.parse(v); return toStrList(j); } catch {}
    return v.split(/[,\n;|]+/g).map(s => s.trim()).filter(Boolean);
  }
  if (typeof v === 'object') {
    const arr =
      v.genres ?? v.genre ?? v.tags ?? v.tag ??
      v.values ?? v.names ?? Object.values(v);
    return toStrList(arr);
  }
  return [String(v)].filter(Boolean);
}

function uniq<T>(xs: T[]): T[] { const s = new Set<T>(); const out: T[] = []; for (const x of xs) { if (!s.has(x)) { s.add(x); out.push(x); } } return out; }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBody(raw: any) {
  const anyId = raw?.id ?? raw?.sid ?? raw?.uid ?? raw?.submission_id ?? raw?.manga_id;
  let action: string = (raw?.action ?? '').toString().toLowerCase().trim();
  if (action === 'approved') action = 'approve';
  if (action === 'rejected') action = 'reject';
  const idStr = anyId == null ? null : String(anyId).trim();
  const cast = idStr && UUID_RE.test(idStr) ? 'uuid' : 'bigint';
  return {
    id: idStr as string | null,
    cast,                             // 'uuid' | 'bigint'
    action,
    note: raw?.note ?? null,
    tags: raw?.tags ?? null,
    tagsOverride: !!raw?.tagsOverride,
    payload: raw?.payload ?? {},
  };
}

/* для списка в админке */
function transformRowToItem(row: any) {
  const p = row.payload || {};
  return {
    id: row.id,
    type: row.type as 'title_add' | 'title_edit',
    status: row.status,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
    manga_id: row.manga_id ?? null,
    payload: p,

    title: p.title_ru || p.title || 'Без названия',
    title_romaji: p.title_romaji ?? null,
    cover_url: p.cover_url ?? null,
    author: p.author ?? null,
    artist: p.artist ?? null,
    description: p.description ?? null,
    status_human: p.status ?? null,
    translation_status: p.translation_status ?? null,
    age_rating: p.age_rating ?? null,
    release_year: p.release_year ?? null,
    type_human: p.type ?? null,

    genres: row.genres || p.genres || null,
    tags: row.tags || p.tags || null,

    author_comment: row.author_comment || null,
    author_name: row.author_name || p.author_name || null,
    sources: row.source_links || null,
  };
}

/* ---------------- GET: список заявок ---------------- */

export async function GET() {
  try {
    const r = await query(
      `select id, type, status, payload, tags, genres, source_links,
              manga_id, reviewed_at, review_note, created_at,
              author_comment, author_name
         from title_submissions
        order by created_at desc
        limit 50`
    );
    const items = r.rows.map(transformRowToItem);
    const stats = {
      total: items.length,
      pending: items.filter(i => i.status === 'pending').length,
      approved: items.filter(i => i.status === 'approved').length,
      rejected: items.filter(i => i.status === 'rejected').length,
    };
    return NextResponse.json({ ok: true, items, stats });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 });
  }
}

/* ---------------- служебные апдейтеры ---------------- */

async function replaceGenres(mangaId: number, list: string[]) {
  // Синхронизируем join-таблицу и колонку text[]
  await query(`delete from manga_genres where manga_id = $1`, [mangaId]);
  if (list.length) {
    const valuesSql = list.map((_, i) => `($1, $${i + 2})`).join(',');
    await query(
      `insert into manga_genres (manga_id, genre) values ${valuesSql}`,
      [mangaId, ...list]
    );
  }
  await query(`update manga set genres = $2 where id = $1`, [mangaId, list]);
}

/* ---------------- POST ---------------- */
/*
  - { action: 'approve' | 'reject', id|sid|uid, note?, tags?, tagsOverride? }
  - иначе { payload, tags? } — создать заявку
*/
export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const { id, cast, action, note, tags, tagsOverride, payload } = normalizeBody(raw);
    const nowIso = new Date().toISOString();

    /* -------- reject -------- */
    if (action === 'reject') {
      if (!id) return NextResponse.json({ ok: false, error: 'id and action are required' }, { status: 400 });
      await query(
        `update title_submissions
            set status='rejected', reviewed_at=$2, review_note=$3
          where id = $1::${cast}`,
        [id, nowIso, note ?? null]
      );
      return NextResponse.json({ ok: true });
    }

    /* -------- approve -------- */
    if (action === 'approve') {
      if (!id) return NextResponse.json({ ok: false, error: 'id and action are required' }, { status: 400 });

      const sRes = await query<any>(`select * from title_submissions where id = $1::${cast}`, [id]);
      if (!sRes.rowCount) return NextResponse.json({ ok: false, error: 'Suggestion not found' }, { status: 404 });

      const row = sRes.rows[0];
      const kind: 'title_add' | 'title_edit' = row.type;
      const p = (row?.payload ?? {}) as any;

      // нормализуем жанры/теги
      const genreList = uniq(
        toStrList(row?.genres).length ? toStrList(row?.genres) :
        (toStrList(p.genre_names).length ? toStrList(p.genre_names) : toStrList(p.genres))
      );

      const tagsFromSug = uniq([
        ...toStrList(row?.tags),
        ...toStrList(p.tags),
        ...toStrList(p.tag_names),
        ...toStrList(p.keywords),
        ...toStrList(p.tags_csv),
      ]);
      const tagList = tagsOverride ? toStrList(tags) : uniq([...tagsFromSug, ...toStrList(tags)]);

      await query('begin');
      try {
        let mangaId: number | null = row?.manga_id ?? null;

        if (kind === 'title_add') {
          // ——— создаём новую мангу
          const ins = await query<{ id: number }>(
            `insert into manga (
               cover_url, title, title_romaji, author, artist, description,
               status, translation_status, age_rating, release_year, type, genres, tags, created_at
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
             returning id`,
            [
              p.cover_url ?? null,
              p.title_ru ?? p.title ?? null,
              p.title_romaji ?? null,
              p.author ?? null,
              p.artist ?? null,
              p.description ?? null,
              p.status ?? null,
              p.translation_status ?? null,
              p.age_rating ?? null,
              p.release_year ?? null,
              p.type ?? null,
              genreList,
              tagList,
            ]
          );
          mangaId = ins.rows?.[0]?.id ?? null;
          if (!mangaId) throw new Error('Insert into manga failed');

          // поддержим join-таблицу жанров
          if (genreList.length) await replaceGenres(mangaId, genreList);
        } else {
          // ——— редактирование существующей
          // найдём целевой id: row.manga_id > payload.mangaId/manga_id
          if (mangaId == null) {
            const pid = Number(p.mangaId ?? p.manga_id ?? NaN);
            if (Number.isFinite(pid)) mangaId = pid;
          }
          if (mangaId == null) throw new Error('Для title_edit не передан manga_id');

          // соберём частичный апдейт — обновляем только переданные поля
          const fields: Record<string, any> = {};
          if ('cover_url' in p) fields.cover_url = p.cover_url ?? null;
          if ('title_ru' in p || 'title' in p) fields.title = p.title_ru ?? p.title ?? null;
          if ('title_romaji' in p) fields.title_romaji = p.title_romaji ?? null;
          if ('author' in p) fields.author = p.author ?? null;
          if ('artist' in p) fields.artist = p.artist ?? null;
          if ('description' in p) fields.description = p.description ?? null;
          if ('status' in p) fields.status = p.status ?? null;
          if ('translation_status' in p) fields.translation_status = p.translation_status ?? null;
          if ('age_rating' in p) fields.age_rating = p.age_rating ?? null;
          if ('release_year' in p) fields.release_year = p.release_year ?? null;
          if ('type' in p) fields.type = p.type ?? null;

          // всегда обновим массивы genres/tags (они из модалки)
          fields.genres = genreList;
          fields.tags = tagList;

          const keys = Object.keys(fields);
          if (keys.length) {
            const setSql = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
            await query(
              `update manga set ${setSql} where id = $1`,
              [mangaId, ...keys.map(k => fields[k])]
            );
          }

          // синхронизируем join-таблицу жанров
          await replaceGenres(mangaId, genreList);

          // если в заявке не было manga_id — проставим его для истории
          if (row.manga_id == null) {
            await query(
              `update title_submissions set manga_id = $2 where id = $1::${cast}`,
              [id, mangaId]
            );
          }
        }

        // закрываем заявку
        await query(
          `update title_submissions
              set status='approved', reviewed_at=$2, review_note=$3, manga_id=$4
            where id=$1::${cast}`,
          [id, nowIso, note ?? null, mangaId]
        );

        await query('commit');
        return NextResponse.json({ ok: true, manga_id: mangaId });
      } catch (e) {
        await query('rollback');
        throw e;
      }
    }

    /* -------- создание новой заявки (fallback) -------- */
    const insSug = await query<{ id: string }>(
      `insert into title_submissions (type, status, payload, tags, created_at)
       values ($1, 'pending', $2::jsonb, $3, now())
       returning id`,
      [payload?.type ?? 'title_add', payload ?? {}, Array.isArray(payload?.tags) ? payload.tags : null]
    );
    return NextResponse.json({ ok: true, id: insSug.rows?.[0]?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 });
  }
}
