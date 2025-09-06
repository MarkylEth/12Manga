// app/api/catalog/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/* ===== Метаданные схемы ===== */
type MangaMeta = {
  cols: Set<string>;
  has: (c: string) => boolean;
  hasChapters: boolean;
};
let metaCache: MangaMeta | null = null;

async function getMangaMeta(): Promise<MangaMeta> {
  if (metaCache) return metaCache;

  // колонки таблицы manga
  const colsRes = await query<{ column_name: string }>(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'manga'
  `);
  const cols = new Set(colsRes.rows.map(r => r.column_name));

  // наличие таблицы chapters
  const chRes = await query<{ exists: boolean }>(`
    select exists(
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = 'chapters'
    ) as exists
  `);

  metaCache = {
    cols,
    has: (c: string) => cols.has(c),
    hasChapters: !!chRes.rows[0]?.exists,
  };
  return metaCache;
}

/* ===== Утилиты ===== */
function parseList(url: URL, key: string): string[] {
  const a = url.searchParams.getAll(key);
  const b = url.searchParams.getAll(`${key}s`);
  return [...a, ...b]
    .flatMap(v => v.split(','))
    .map(s => s.trim())
    .filter(Boolean);
}

/* ===== Handler ===== */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit  = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 24, 100));
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
    const q      = (url.searchParams.get('q') || '').trim();

    const statuses  = parseList(url, 'status');
    const tStatuses = parseList(url, 'translation_status');
    const genres    = parseList(url, 'genre');
    const tags      = parseList(url, 'tag');
    const yearFrom  = url.searchParams.get('year_from');
    const yearTo    = url.searchParams.get('year_to');
    const ratingMin = url.searchParams.get('rating_min');
    const ratingMax = url.searchParams.get('rating_max');
    const sortParam =
      (url.searchParams.get('sort') || 'popular') as
      'popular'|'updated'|'new'|'rating'|'year_desc'|'year_asc'|'title_asc'|'title_desc';

    const { has, hasChapters } = await getMangaMeta();

    // genres/tags -> JSONB для унифицированного вывода
    const genresJson =
      has('genres')  ? `to_jsonb(m.genres)` :
      has('genres2') ? `coalesce(m.genres2, '[]'::jsonb)` :
                       `'[]'::jsonb`;

    const tagsJson =
      has('tags')    ? `to_jsonb(m.tags)` :
      has('tags2')   ? `coalesce(m.tags2, '[]'::jsonb)` :
                       `'[]'::jsonb`;

    const selectPieces: string[] = [
      `m.id`,
      has('title') ? `m.title` : `'Untitled'::text as title`,
      has('author') ? `m.author` : `NULL::text as author`,
      has('type') ? `m.type` : `NULL::text as type`,
      has('cover_url') ? `m.cover_url` : `NULL::text as cover_url`,
      has('status') ? `m.status` : `NULL::text as status`,
      has('translation_status') ? `m.translation_status` : `NULL::text as translation_status`,
      has('rating') ? `m.rating::float as rating` : `NULL::float as rating`,
      has('release_year') ? `m.release_year` : `NULL::int as release_year`,

      // возраст
      has('age_rating') ? `m.age_rating as age_rating`
      : has('age')      ? `m.age as age_rating`
                        : `NULL::text as age_rating`,

      `${genresJson} as genres`,
      `${tagsJson} as tags`,

      // просмотры
      has('view_count') ? `coalesce(m.view_count, 0) as views`
      : has('views')    ? `coalesce(m.views, 0) as views`
                        : `0 as views`,

      // количество глав
      hasChapters ? `coalesce(ch.chapters_count, 0) as chapters_count` : `0 as chapters_count`,

      // дата
      (has('created_at') || has('updated_at'))
        ? `coalesce(m.updated_at, m.created_at, now()) as created_at`
        : `now() as created_at`,

      // total для пагинации
      `COUNT(*) OVER() as total`,
    ];

    // WHERE + параметры
    const where: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (q && has('title')) {
      if (has('original_title')) {
        where.push(`(m.title ILIKE $${i} OR coalesce(m.original_title,'') ILIKE $${i})`);
      } else {
        where.push(`m.title ILIKE $${i}`);
      }
      params.push(`%${q}%`); i++;
    }

    if (statuses.length && has('status')) {
      where.push(`m.status = ANY($${i}::text[])`);
      params.push(statuses); i++;
    }

    if (tStatuses.length && has('translation_status')) {
      where.push(`m.translation_status = ANY($${i}::text[])`);
      params.push(tStatuses); i++;
    }

    if (genres.length && (has('genres') || has('genres2'))) {
      if (has('genres')) {
        // text[]
        where.push(`m.genres && $${i}::text[]`);
        params.push(genres); i++;
      } else {
        // jsonb
        where.push(`
          exists (
            select 1
            from jsonb_array_elements_text(coalesce(m.genres2,'[]'::jsonb)) g(val)
            where g.val = any($${i}::text[])
          )
        `);
        params.push(genres); i++;
      }
    }

    if (tags.length && (has('tags') || has('tags2'))) {
      if (has('tags')) {
        where.push(`m.tags && $${i}::text[]`);
        params.push(tags); i++;
      } else {
        where.push(`
          exists (
            select 1
            from jsonb_array_elements_text(coalesce(m.tags2,'[]'::jsonb)) t(val)
            where t.val = any($${i}::text[])
          )
        `);
        params.push(tags); i++;
      }
    }

    if (yearFrom && has('release_year')) { where.push(`coalesce(m.release_year,0) >= $${i}`); params.push(Number(yearFrom)); i++; }
    if (yearTo   && has('release_year')) { where.push(`coalesce(m.release_year,9999) <= $${i}`); params.push(Number(yearTo)); i++; }
    if (ratingMin && has('rating'))      { where.push(`coalesce(m.rating,0) >= $${i}`); params.push(Number(ratingMin)); i++; }
    if (ratingMax && has('rating'))      { where.push(`coalesce(m.rating,0) <= $${i}`); params.push(Number(ratingMax)); i++; }

    const whereSql = where.length ? `where ${where.join('\n  and ')}` : '';

    // ORDER BY только по существующим полям
    const orderSql =
      (sortParam === 'popular' && (has('view_count') || has('views')))
        ? `coalesce(${has('view_count') ? 'm.view_count' : 'm.views'},0) desc nulls last,
           ${has('updated_at') ? 'coalesce(m.updated_at, m.created_at, now())' : 'coalesce(m.created_at, now())'} desc`
      : (sortParam === 'updated' && has('updated_at'))
        ? `coalesce(m.updated_at, m.created_at, now()) desc`
      : (sortParam === 'new')
        ? `${has('created_at') ? 'coalesce(m.created_at, m.updated_at, now())' : 'now()'} desc`
      : (sortParam === 'rating' && has('rating'))
        ? `coalesce(m.rating,0) desc nulls last`
      : (sortParam === 'year_desc' && has('release_year'))
        ? `coalesce(m.release_year,0) desc nulls last`
      : (sortParam === 'year_asc' && has('release_year'))
        ? `coalesce(m.release_year,9999) asc nulls first`
      : (sortParam === 'title_asc' && has('title'))
        ? `lower(m.title) asc nulls last`
      : (sortParam === 'title_desc' && has('title'))
        ? `lower(m.title) desc nulls last`
      : `${has('created_at') ? 'coalesce(m.created_at, now())' : 'now()'} desc`;

    // SQL с опциональным CTE/JOIN по таблице chapters
    const withCh = hasChapters ? `
      with ch as (
        select manga_id, count(*)::int as chapters_count
        from public.chapters
        group by manga_id
      )
    ` : '';

    const joinCh = hasChapters ? `left join ch on ch.manga_id = m.id` : '';

    const sql = `
      ${withCh}
      select
        ${selectPieces.join(',\n        ')}
      from public.manga m
      ${joinCh}
      ${whereSql}
      order by ${orderSql}
      limit $${i} offset $${i + 1};
    `;
    params.push(limit, offset);

    const r = await query<any>(sql, params);
    const rows = r.rows ?? [];
    const total = rows.length ? Number(rows[0].total) : 0;

    return NextResponse.json(
      {
        ok: true,
        data: rows.map(({ total: _t, ...x }) => x),
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error('[api/catalog] error:', e?.code, e?.message);
    // Возвращаем 200, чтобы фронт не падал. Ошибка в поле ok/ message.
    return NextResponse.json(
      { ok: false, data: [], code: e?.code, message: e?.message ?? 'Internal error' },
      { status: 200 }
    );
  }
}
