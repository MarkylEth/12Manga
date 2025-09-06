// app/api/admin/manga-moderation/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toStrList(v: any): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string') return v.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  if (typeof v === 'object') {
    const arr = Array.isArray((v as any).names) ? (v as any).names : Object.values(v);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  }
  return [];
}
function uniq<T>(arr: T[]): T[] {
  const s = new Set<T>(); const out: T[] = [];
  for (const x of arr) if (!s.has(x)) { s.add(x); out.push(x); }
  return out;
}

/* ----------------------------- GET: список ----------------------------- */
export async function GET() {
  try {
    // Получаем заявки с дополнительными полями
    const sRes = await query<any>(
      `select id, status, payload, created_at, tags, genres, 
              title_romaji, author_comment, author_name, user_id
         from title_submissions
        order by created_at desc
        limit 200`
    );
    
    const suggestions = (sRes.rows ?? []).map(r => {
      const p = r?.payload ?? {};
      return {
        sid: r.id,
        uid: r.id, // для совместимости с keyFor
        kind: 'suggestion' as const,
        
        // Основные поля извлекаем из payload
        title: p.title_ru ?? p.title ?? 'Без названия',
        cover_url: p.cover_url ?? null,
        author: p.author ?? null,
        artist: p.artist ?? null,
        description: p.description ?? null,
        status: p.status ?? null,
        
        // Дополнительные поля
        original_title: p.original_title ?? null,
        type: p.type ?? null,
        translation_status: p.translation_status ?? null,
        age_rating: p.age_rating ?? null,
        release_year: p.release_year ?? null,
        title_romaji: r.title_romaji ?? p.title_romaji ?? null,
        
        // Статус модерации
        submission_status: r.status ?? 'pending',
        created_at: r.created_at,
        updated_at: null,
        
        // Жанры и теги
        genres: r.genres ?? p.genres ?? null,
        tags: r.tags ?? p.tags ?? null,
        manga_genres: null,
        tag_list: null,
        
        // Метаданные
        payload: p, // сохраняем для детального просмотра
        translator_team_id: p.translator_team_id ?? null,
        author_comment: r.author_comment ?? null,
        sources: null,
        author_name: r.author_name ?? p.author_name ?? null,
        slug: null,
      };
    });

    // манга (как опубликованный контент)
    const mRes = await query<any>(
      `select id, title, cover_url, author, artist, description, status,
              created_at, title_romaji, slug, genres, tags, 
              translation_status, age_rating, release_year, type
         from manga
        order by id desc
        limit 200`
    );
    
    const manga = (mRes.rows ?? []).map(r => ({
      id: r.id,
      sid: null,
      uid: null,
      kind: 'manga' as const,
      
      title: r.title ?? 'Без названия',
      cover_url: r.cover_url ?? null,
      author: r.author ?? null,
      artist: r.artist ?? null,
      description: r.description ?? null,
      status: r.status ?? null,
      
      // Дополнительные поля
      original_title: null,
      type: r.type ?? null,
      translation_status: r.translation_status ?? null,
      age_rating: r.age_rating ?? null,
      release_year: r.release_year ?? null,
      title_romaji: r.title_romaji ?? null,
      
      submission_status: 'approved' as const,
      created_at: r.created_at,
      updated_at: null,
      
      // Жанры и теги из manga таблицы
      genres: r.genres ?? null,
      tags: r.tags ?? null,
      manga_genres: null,
      tag_list: null,
      
      payload: null,
      translator_team_id: null,
      author_comment: null,
      sources: null,
      author_name: null,
      slug: r.slug ?? null,
    }));

    const items = [...suggestions, ...manga];
    const stats = {
      total: items.length,
      manga: manga.length,
      suggestions: suggestions.length,
      pending: suggestions.filter(s => s.submission_status === 'pending').length,
      approved:
        suggestions.filter(s => s.submission_status === 'approved').length +
        manga.length,
      rejected: suggestions.filter(s => s.submission_status === 'rejected').length,
    };

    return NextResponse.json({ ok: true, items, stats });
  } catch (e: any) {
    console.error('Error in GET /api/admin/manga-moderation:', e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}

/* ----------------------------- POST: модерация ----------------------------- */
function normalize(raw: any) {
  const anyId = raw?.id ?? raw?.sid ?? raw?.uid ?? raw?.submission_id ?? raw?.manga_id;
  let action: string = (raw?.action ?? '').toString().toLowerCase().trim();
  if (action === 'approved') action = 'approve';
  if (action === 'rejected') action = 'reject';
  const idStr = anyId == null ? null : String(anyId).trim();
  const cast = idStr && UUID_RE.test(idStr) ? 'uuid' : 'bigint';
  return {
    id: idStr as string | null,
    cast, // 'uuid' | 'bigint'
    action,
    note: raw?.note ?? null,
    tags: raw?.tags ?? null,
    tagsOverride: !!raw?.tagsOverride,
    kind: raw?.kind ?? null,
  };
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const { id, cast, action, note, tags, tagsOverride, kind } = normalize(raw);

    if (!action) return NextResponse.json({ ok: false, error: 'action is required' }, { status: 400 });
    if (!id)     return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });

    const treatAsSuggestion =
      (kind === 'suggestion') || cast === 'uuid' || raw?.sid || raw?.uid;

    if (treatAsSuggestion) {
      const nowIso = new Date().toISOString();

      if (action === 'reject') {
        await query(
          `update title_submissions
              set status='rejected', reviewed_at=$2, review_note=$3
            where id=$1::${cast}`,
          [id, nowIso, note ?? null]
        );
        return NextResponse.json({ ok: true });
      }

      if (action === 'approve') {
        const sRes = await query<any>(`select * from title_submissions where id=$1::${cast}`, [id]);
        if (!sRes.rowCount) {
          return NextResponse.json({ ok: false, error: 'Suggestion not found' }, { status: 404 });
        }

        const row = sRes.rows[0];
        const p = (row?.payload ?? {}) as any;
        let mangaId: number | null = row?.manga_id ?? null;

        const genreList = uniq(toStrList(p.genre_names).length ? toStrList(p.genre_names) : toStrList(p.genres));
        const tagsFromSug = uniq([
          ...toStrList(row?.tags),
          ...toStrList(p.tags),
          ...toStrList(p.tag_names),
          ...toStrList(p.keywords),
          ...toStrList(p.tags_csv),
        ]);
        const tagList = tagsOverride ? toStrList(tags) : uniq([...tagsFromSug, ...toStrList(tags)]);

        if (mangaId == null) {
          const ins = await query<{ id: number }>(
            `insert into manga (
               cover_url, title, title_romaji, author, artist, description,
               status, translation_status, age_rating, release_year, type, created_at
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
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
            ]
          );
          mangaId = ins.rows?.[0]?.id ?? null;
          if (!mangaId) {
            return NextResponse.json({ ok: false, error: 'Insert into manga failed' }, { status: 500 });
          }
        }

        await query(`update manga set genres=$2, tags=$3 where id=$1`, [mangaId, genreList, tagList]);

        await query(
          `update title_submissions
              set status='approved', reviewed_at=$2, review_note=$3, manga_id=$4
            where id=$1::${cast}`,
          [id, new Date().toISOString(), note ?? null, mangaId]
        );

        return NextResponse.json({ ok: true, manga_id: mangaId });
      }

      return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
    }

    // модерация уже созданной манги (если понадобится)
    return NextResponse.json({ ok: false, error: 'unsupported kind for this endpoint' }, { status: 400 });
  } catch (e: any) {
    console.error('Error in POST /api/admin/manga-moderation:', e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}