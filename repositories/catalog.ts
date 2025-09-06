// repositories/catalog.ts
// Каталог тайтлов на Postgres (Neon) через наш lib/db.ts
// Никаких supabase.* — только SQL.

import { many, one } from '@/lib/db';
import { clamp, normalizeText, toStringList } from '@/lib/normalize';
import { romajiSlug, makeIdSlug } from '@/lib/slug';

export type CatalogSort =
  | 'new'          // по новизне (created_at DESC)
  | 'updated'      // по обновлению (updated_at DESC)
  | 'popular'      // по популярности (views DESC при наличии, иначе rating_count DESC)
  | 'rating';      // по среднему рейтингу (rating DESC)

export type CatalogStatus = 'ongoing' | 'completed' | 'paused' | string;
export type CatalogType = 'манга' | 'манхва' | 'маньхуа' | 'другое' | string;

export type CatalogFilter = {
  q?: string;                  // строка поиска по названию/ромадзи/ориг.
  genres?: string[] | string;  // массив жанров/CSV
  tags?: string[] | string;    // массив тегов/CSV
  status?: CatalogStatus | null;
  type?: CatalogType | null;
  year?: number | null;        // релиз
  sort?: CatalogSort;
  page?: number;               // 1..N
  limit?: number;              // 1..100
};

export type CatalogItem = {
  id: number;
  title: string;
  cover_url: string | null;
  title_romaji: string | null;
  original_title: string | null;
  author: string | null;
  artist: string | null;
  release_year: number | null;

  rating: number | null;
  rating_count: number | null;

  chapters_count: number;      // подсчитано в репозитории
  slug: string;                // удобный slug вида "123-title"
};

export type CatalogResult = {
  items: CatalogItem[];
  meta: {
    page: number;
    limit: number;
    total?: number;            // будет, если включён подсчёт (см. countTotal)
  };
};

type SqlChunk = { text: string; params: any[] };

// ————— helpers —————

function buildWhere(f: CatalogFilter): SqlChunk {
  const params: any[] = [];
  const conds: string[] = [];

  if (f.q) {
    const q = `%${normalizeText(f.q).toLowerCase()}%`;
    params.push(q, q, q);
    conds.push(`(LOWER(m.title) LIKE $${params.length - 2} OR LOWER(m.title_romaji) LIKE $${params.length - 1} OR LOWER(m.original_title) LIKE $${params.length})`);
  }

  if (f.status) {
    params.push(String(f.status));
    conds.push(`m.status = $${params.length}`);
  }

  if (f.type) {
    params.push(String(f.type));
    conds.push(`m.type = $${params.length}`);
  }

  if (typeof f.year === 'number' && Number.isFinite(f.year)) {
    params.push(f.year | 0);
    conds.push(`m.release_year = $${params.length}`);
  }

  const genres = toStringList(f.genres);
  if (genres.length) {
    // genres храним в таблице manga_genres (m2m: manga_id, genre)
    const inParams: string[] = [];
    for (const g of genres) {
      params.push(g.toLowerCase());
      inParams.push(`$${params.length}`);
    }
    conds.push(`EXISTS (SELECT 1 FROM manga_genres mg WHERE mg.manga_id = m.id AND LOWER(mg.genre) IN (${inParams.join(',')}))`);
  }

  const tags = toStringList(f.tags);
  if (tags.length) {
    // теги либо массив в manga.tags, либо отдельная таблица manga_tags
    // попробуем обе схемы — условие на массив и условие на m2m (если есть)
    const inParams: string[] = [];
    for (const t of tags) {
      params.push(t.toLowerCase());
      inParams.push(`$${params.length}`);
    }
    const arrCond = `EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(m.tags, '[]'::jsonb)) AS t(val)
      WHERE LOWER(t.val) IN (${inParams.join(',')})
    )`;
    const m2mCond = `EXISTS (
      SELECT 1 FROM manga_tags mt
      WHERE mt.manga_id = m.id AND LOWER(mt.tag) IN (${inParams.join(',')})
    )`;
    conds.push(`( ${arrCond} OR ${m2mCond} )`);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return { text: where, params };
}

function buildOrder(sort?: CatalogSort): string {
  switch (sort) {
    case 'updated':  return 'ORDER BY m.updated_at DESC NULLS LAST';
    case 'popular':  return 'ORDER BY COALESCE(m.views, 0) DESC, COALESCE(m.rating_count, 0) DESC';
    case 'rating':   return 'ORDER BY COALESCE(m.rating, 0) DESC';
    case 'new':
    default:         return 'ORDER BY m.created_at DESC NULLS LAST';
  }
}

// ————— main API —————

export async function getCatalog(filter: CatalogFilter = {}, opts?: { countTotal?: boolean }): Promise<CatalogResult> {
  const page  = clamp(filter.page ?? 1, 1, 10_000);
  const limit = clamp(filter.limit ?? 24, 1, 100);
  const offset = (page - 1) * limit;

  const where = buildWhere(filter);
  const order = buildOrder(filter.sort);

  // Подсчёт глав — лёгкий LEFT JOIN + COUNT(*) OVER или отдельный подзапрос
  const sql =
    `WITH c AS (
       SELECT ch.manga_id, COUNT(*) AS cnt
       FROM chapters ch
       GROUP BY ch.manga_id
     )
     SELECT
       m.id,
       m.title,
       m.cover_url,
       m.title_romaji,
       m.original_title,
       m.author,
       m.artist,
       m.release_year,
       m.rating,
       m.rating_count,
       COALESCE(c.cnt, 0)::int AS chapters_count
     FROM manga m
     LEFT JOIN c ON c.manga_id = m.id
     ${where.text}
     ${order}
     LIMIT ${limit} OFFSET ${offset}`;

  const rows = await many<{
    id: number;
    title: string;
    cover_url: string | null;
    title_romaji: string | null;
    original_title: string | null;
    author: string | null;
    artist: string | null;
    release_year: number | null;
    rating: number | null;
    rating_count: number | null;
    chapters_count: number;
  }>(sql, where.params);

  const items: CatalogItem[] = rows.map(r => ({
    ...r,
    slug: makeIdSlug(r.id, r.title_romaji || r.original_title || r.title || romajiSlug(r.id)),
  }));

  let total: number | undefined = undefined;
  if (opts?.countTotal) {
    const countRow = await one<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM manga m ${where.text}`,
      where.params
    );
    total = countRow ? Number(countRow.total) : undefined;
  }

  return {
    items,
    meta: { page, limit, ...(total !== undefined ? { total } : {}) },
  };
}

// Быстрые преднастроенные выборки
export async function getLatest(limit = 12) {
  return getCatalog({ sort: 'new', limit }, { countTotal: false });
}

export async function getPopular(limit = 12) {
  return getCatalog({ sort: 'popular', limit }, { countTotal: false });
}

export async function searchCatalog(q: string, limit = 20) {
  return getCatalog({ q, limit, sort: 'updated' }, { countTotal: true });
}
