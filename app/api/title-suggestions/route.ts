// app/api/title-suggestions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ================= helpers ================= */
function toStrList(v: any): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string') {
    // поддерживаем CSV, точки с запятой и перевод строки
    return v.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  }
  if (typeof v === 'object') {
    const arr = Array.isArray((v as any).names) ? (v as any).names : Object.values(v as any);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  }
  return [];
}
function uniq<T>(arr: T[]): T[] {
  const s = new Set<T>();
  const out: T[] = [];
  for (const x of arr) if (!s.has(x)) { s.add(x); out.push(x); }
  return out;
}
const toInt = (v: any): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[^\d-]+/g, ''));
  return Number.isFinite(n) ? n : null;
};

/* =============== GET: список заявок =============== */
/**
 * Квери-параметры:
 * - status=pending|approved|rejected|all (default: pending)
 * - q=строка (ищем по author_name и payload.title/title_ru/title_romaji)
 * - limit (<=100), offset
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || 'pending').toLowerCase();
    const q = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const params: any[] = [];
    const where: string[] = [];
    if (status !== 'all') {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const i = params.length;
      where.push(`(
        COALESCE(author_name,'') ILIKE $${i}
        OR COALESCE(payload->>'title','') ILIKE $${i}
        OR COALESCE(payload->>'title_ru','') ILIKE $${i}
        OR COALESCE(payload->>'title_romaji','') ILIKE $${i}
      )`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    params.push(limit);
    const limIdx = params.length;
    params.push(offset);
    const offIdx = params.length;

    const sql = `
      SELECT id, status, payload, tags, manga_id, reviewed_at, review_note, created_at
      FROM title_suggestions
      ${whereSql}
      ORDER BY id DESC
      LIMIT $${limIdx}
      OFFSET $${offIdx}
    `;
    const r = await query(sql, params);
    return NextResponse.json({ ok: true, items: r.rows, limit, offset });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 });
  }
}

/* =============== POST: создание/модерация =============== */
/**
 * Тело:
 * 1) Создание заявки:
 *    { payload: {...}, tags?: string[] }
 *
 * 2) Отклонить:
 *    { action: 'reject', id: number, note?: string }
 *
 * 3) Утвердить:
 *    { action: 'approve', id: number, note?: string, tags?: string[]|string, tagsOverride?: boolean }
 *    - Если в заявке нет manga_id — создаём в manga запись
 *    - genres/tags пишем в поля самой manga как TEXT[]
 */
export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const nowIso = new Date().toISOString();

    /* ---------- reject ---------- */
    if (body?.action === 'reject') {
      const id = Number(body.id);
      const note = body.note ?? null;
      if (!Number.isFinite(id)) {
        return NextResponse.json({ ok: false, error: 'bad id' }, { status: 400 });
      }
      await query(
        `UPDATE title_suggestions
           SET status='rejected', reviewed_at=$2, review_note=$3
         WHERE id=$1`,
        [id, nowIso, note]
      );
      return NextResponse.json({ ok: true });
    }

    /* ---------- approve ---------- */
    if (body?.action === 'approve') {
      const id = Number(body.id);
      const note = body.note ?? null;
      if (!Number.isFinite(id)) {
        return NextResponse.json({ ok: false, error: 'bad id' }, { status: 400 });
      }

      const sug = await query<any>(`SELECT * FROM title_suggestions WHERE id=$1`, [id]);
      if (!sug.rowCount) {
        return NextResponse.json({ ok: false, error: 'Suggestion not found' }, { status: 404 });
      }
      const row = sug.rows[0];
      const p = (row?.payload ?? {}) as any;

      // жанры/теги: берём из заявки + из тела запроса
      const genreList = uniq(
        toStrList(p.genre_names).length ? toStrList(p.genre_names) : toStrList(p.genres)
      );
      const tagsFromSug = uniq([
        ...toStrList(row?.tags),
        ...toStrList(p.tags),
        ...toStrList(p.tag_names),
        ...toStrList(p.keywords),
        ...toStrList(p.tags_csv),
      ]);
      const tagList = body?.tagsOverride
        ? toStrList(body.tags)
        : uniq([...tagsFromSug, ...toStrList(body?.tags)]);

      let mangaId: number | null = row?.manga_id ?? null;

      if (mangaId == null) {
        // создаём тайтл
        const ins = await query<{ id: number }>(
          `INSERT INTO manga (
             cover_url, title, title_romaji, author, artist, description,
             status, translation_status, age_rating, release_year, type, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())
           RETURNING id`,
          [
            p.cover_url ?? null,
            p.title_ru ?? p.title ?? null,
            p.title_romaji ?? null,
            p.author ?? null,
            p.artist ?? null,
            p.description ?? null,
            p.status ?? null,
            p.translation_status ?? null,
            toInt(p.age_rating),           // если в БД TEXT — замени на p.age_rating ?? null
            toInt(p.release_year),         // если в БД TEXT — замени на p.release_year ?? null
            p.type ?? null,
          ]
        );
        mangaId = ins.rows?.[0]?.id ?? null;
        if (!mangaId) {
          return NextResponse.json({ ok: false, error: 'Insert into manga failed' }, { status: 500 });
        }
      } else {
        // при необходимости можно обновлять поля из payload (пример):
        // await query(`UPDATE manga SET title=$2 WHERE id=$1`, [mangaId, p.title_ru ?? p.title ?? null]);
      }

      // genres/tags -> в саму manga как TEXT[]
      await query(
        `UPDATE manga SET genres=$2, tags=$3 WHERE id=$1`,
        [mangaId, genreList, tagList]
      );
      // Если у тебя genres — TEXT (CSV), используй:
      // await query(`UPDATE manga SET genres=$2, tags=$3 WHERE id=$1`, [mangaId, genreList.join(', '), tagList]);

      // апдейтим заявку
      await query(
        `UPDATE title_suggestions
           SET status='approved', reviewed_at=$2, review_note=$3, manga_id=$4
         WHERE id=$1`,
        [id, nowIso, note, mangaId]
      );

      return NextResponse.json({ ok: true, manga_id: mangaId });
    }

    /* ---------- create ---------- */
    const payload = body?.payload ?? {};
    const tags = Array.isArray(body?.tags) ? body.tags : toStrList(body?.tags);

    const insSug = await query<{ id: number }>(
      `INSERT INTO title_suggestions (status, payload, tags, created_at)
       VALUES ('pending', $1::jsonb, $2, NOW())
       RETURNING id`,
      [payload, tags?.length ? tags : null]
    );
    return NextResponse.json({ ok: true, id: insSug.rows?.[0]?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 });
  }
}
