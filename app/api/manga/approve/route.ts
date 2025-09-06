// app/api/manga/approve/route.ts
import { NextRequest } from 'next/server';
import { withTransaction } from '@/lib/db';
import type { PoolClient } from 'pg';

type AnyObj = Record<string, any>;

const toInt = (v: any): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[^\d-]+/g, ''));
  return Number.isFinite(n) ? n : null;
};

const toStrList = (v: any): string[] => {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string') {
    return v
      .split(/\r?\n/)
      .flatMap((s) => s.split(','))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

// на случай, если у тебя есть m2m-таблицы manga_genres/manga_tags — оставляю хелпер
async function m2mReplace(
  client: PoolClient,
  table: 'manga_genres' | 'manga_tags',
  col: 'genre' | 'tag',
  mangaId: number,
  list: string[],
) {
  await client.query(`DELETE FROM ${table} WHERE manga_id = $1`, [mangaId]);
  if (!list.length) return;
  const values = list.map((_, i) => `($1, $${i + 2})`).join(',');
  await client.query(`INSERT INTO ${table} (manga_id, ${col}) VALUES ${values}`, [mangaId, ...list]);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { id, action, note } = (await req.json()) as {
      id: number;
      action: 'approve' | 'reject';
      note?: string | null;
    };

    if (!id || !action) {
      return Response.json({ ok: false, error: 'id and action are required' }, { status: 400 });
    }

    const result = await withTransaction(async (client) => {
      // 1) читаем заявку
      const sRes = await client.query('SELECT * FROM title_submissions WHERE id = $1 FOR UPDATE', [id]);
      if (sRes.rowCount === 0) throw new Error('submission_not_found');
      const sug = sRes.rows[0];
      const p: AnyObj = sug?.payload ?? {};

      const sources: string[] = Array.isArray(sug?.source_links) ? sug.source_links : [];
      const genres: string[] = Array.isArray(sug?.genres) ? sug.genres : toStrList(p.genres);
      const tags: string[] =
        Array.isArray(sug?.tags) ? sug.tags : toStrList(p.tags ?? p.tag_names ?? p.keywords);

      // 2) reject
      if (action === 'reject') {
        await client.query(
          `UPDATE title_submissions
             SET status = 'rejected',
                 reviewed_at = NOW(),
                 author_comment = COALESCE($2, author_comment)
           WHERE id = $1`,
          [id, note ?? null],
        );
        return { ok: true, manga_id: null };
      }

      // 3) approve → insert/update manga
      const src = {
        cover_url:          p.cover_url ?? null,
        title:              p.title_ru ?? p.title ?? null, // у тебя в схеме колонка title
        title_romaji:       p.title_romaji ?? null,
        author:             p.author ?? null,
        artist:             p.artist ?? null,
        description:        p.description ?? null,
        status:             p.status ?? null,
        translation_status: p.translation_status ?? null,
        age_rating:         toInt(p.age_rating),   // если у тебя TEXT — можно заменить на p.age_rating ?? null
        release_year:       toInt(p.release_year), // если у тебя TEXT — можно заменить на p.release_year ?? null
        type:               p.type ?? null,
      };

      let mangaId: number | null =
        typeof sug?.manga_id === 'number' ? sug.manga_id : null;

      if (mangaId == null) {
        // вставка с genres/tags как TEXT[]
        const ins = {
          ...src,
          genres: genres, // TEXT[]
          tags: tags,     // TEXT[]
          submission_status: 'approved',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          submitted_by: sug?.user_id ?? null,
        };
        const cols = Object.keys(ins);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const values = Object.values(ins);

        const iRes = await client.query(
          `INSERT INTO manga (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
          values,
        );
        mangaId = iRes.rows[0].id as number;
      } else {
        // обновление существующей записи
        const upd = {
          ...src,
          genres: genres,
          tags: tags,
          updated_at: new Date().toISOString(),
        };
        const sets = Object.keys(upd).map((k, i) => `${k} = $${i + 2}`).join(', ');
        const values = [mangaId, ...Object.values(upd)];
        await client.query(`UPDATE manga SET ${sets} WHERE id = $1`, values);
      }

      // 4) при желании — синхронизируем m2m-таблицы (если они есть)
      // await m2mReplace(client, 'manga_genres', 'genre', mangaId!, genres);
      // await m2mReplace(client, 'manga_tags',  'tag',   mangaId!, tags);

      // 5) помечаем заявку
      await client.query(
        `UPDATE title_submissions
            SET status       = 'approved',
                reviewed_at  = NOW(),
                manga_id     = $2,
                author_comment = COALESCE($3, author_comment),
                source_links = COALESCE($4::text[], source_links)
          WHERE id = $1`,
        [id, mangaId, note ?? null, sources],
      );

      return { ok: true, manga_id: mangaId };
    });

    return Response.json(result);
  } catch (e: any) {
    console.error(e);
    return Response.json({ ok: false, error: e?.message || 'approve_failed' }, { status: 500 });
  }
}
