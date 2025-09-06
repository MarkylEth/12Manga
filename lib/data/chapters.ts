// lib/data/chapters.ts
import { query } from '@/lib/db';

type OrderBy = 'created_at' | 'number';
type OrderDir = 'asc' | 'desc';

/**
 * Публичные (published) главы для страницы тайтла.
 * Если в БД нет колонки status — тихо отдаем все главы без фильтра.
 */
export async function getPublicChaptersByManga(
  mangaId: number,
  { limit = 0, order = 'desc', by = 'created_at' as OrderBy } = {}
) {
  const dir: OrderDir = order === 'asc' ? 'asc' : 'desc';
  const bySafe: OrderBy = by === 'number' ? 'number' : 'created_at';

  const orderBy =
    bySafe === 'number'
      ? `coalesce(chapter_number,0) ${dir}, created_at desc`
      : `created_at ${dir}, coalesce(chapter_number,0) desc`;

  const params: any[] = [mangaId];
  const lim = Math.max(0, Math.floor(limit));
  const limitSql = lim ? ` limit $${params.push(lim)}` : '';

  const base = `
    select id, manga_id, coalesce(chapter_number,0) as chapter_number,
           coalesce(volume,0) as volume, coalesce(title,'') as title,
           status, pages_count, created_at, updated_at
      from chapters
     where manga_id = $1`;

  const sqlWithStatus    = `${base} and lower(status) = 'published' order by ${orderBy}${limitSql}`;
  const sqlWithoutStatus = `${base} order by ${orderBy}${limitSql}`;

  try {
    const { rows } = await query(sqlWithStatus, params);
    return rows;
  } catch (e: any) {
    // 42703 = undefined_column — колонки status нет: повторяем без фильтра
    if (e?.code === '42703' || /column .*status.* does not exist/i.test(String(e?.message || ''))) {
      const { rows } = await query(sqlWithoutStatus, params);
      return rows;
    }
    throw e;
  }
}
