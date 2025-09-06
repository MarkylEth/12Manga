import { NextRequest } from 'next/server';
import { query } from '@/lib/db';

/** Хелперы парсинга в старом стиле */
const toStr = (v: any) => (v == null ? null : String(v));
const toInt = (v: any): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[^\d-]+/g, ''));
  return Number.isFinite(n) ? n : null;
};
const toStrList = (v: any): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === 'string') {
    // поддержка "по строкам", CSV и т.п.
    const lines = v.split(/\r?\n/).flatMap(s => s.split(','));
    return lines.map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get('content-type') || '';
    let body: any = {};
    if (ct.includes('application/json')) {
      body = await req.json();
    } else if (ct.includes('form-data')) {
      const fd = await req.formData();
      body = Object.fromEntries(fd.entries());
    } else {
      // попытаемся распарсить JSON, иначе 400
      try { body = JSON.parse(await req.text()); }
      catch { return Response.json({ ok: false, error: 'Body must be JSON' }, { status: 400 }); }
    }

    // кто отправил
    const user_id: string | null = body.user_id ?? null;           // UUID (profiles.id)
    const author_name: string | null = body.author_name ?? null;   // подпись автора

    // комментарий автора (как в старом UI)
    const author_comment: string | null = body.author_comment ?? body.comment ?? null;

    // если есть manga_id — это редактирование; иначе — добавление
    const manga_id =
      body.manga_id == null
        ? null
        : Number.isFinite(Number(body.manga_id))
        ? Number(body.manga_id)
        : null;

    const submission_type: 'title_add' | 'title_edit' =
      body.type === 'title_edit' ? 'title_edit' : (manga_id ? 'title_edit' : 'title_add');

    // payload — сырые поля
    const p: Record<string, any> = body.payload ?? body ?? {};

    // явные массивы (в БД храним отдельными колонками, как у тебя было)
    const source_links = toStrList(body.source_links ?? p.source_links ?? '');
    const genres = toStrList(body.genres ?? p.genres ?? '');
    const tags = toStrList(body.tags ?? p.tags ?? p.tag_names ?? p.keywords ?? '');

    // отдельные полезные поля из payload
    const title_romaji = toStr(p.title_romaji);

    // INSERT
    const sql = `
      INSERT INTO title_submissions (
        user_id, author_name, manga_id, type, status,
        payload, source_links, genres, tags,
        title_romaji, author_comment, created_at
      ) VALUES (
        $1, $2, $3, $4, 'pending',
        $5::jsonb, $6::text[], $7::text[], $8::text[],
        $9, $10, NOW()
      )
      RETURNING id
    `;
    const params = [
      user_id,
      author_name,
      manga_id,
      submission_type,
      JSON.stringify(p),
      source_links,
      genres,
      tags,
      title_romaji,
      author_comment,
    ];

    const { rows } = await query<{ id: number }>(sql, params);
    return Response.json({ ok: true, id: rows[0].id });
  } catch (e: any) {
    console.error(e);
    return Response.json({ ok: false, error: e?.message || 'submit_failed' }, { status: 500 });
  }
}
