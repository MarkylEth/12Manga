// app/api/chapters/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUploader, requireRole } from '@/lib/auth/route-guards';

type PageIn = { index: number; key: string; url?: string | null; name?: string | null };

async function hasColumn(table: string, col: string) {
  const { rowCount } = await query(
    `select 1
       from information_schema.columns
      where table_schema='public' and table_name=$1 and column_name=$2
      limit 1`,
    [table, col]
  );
  return (rowCount ?? 0) > 0;
}

function allowByApiKey(req: Request) {
  const k = req.headers.get('x-api-key')?.trim();
  return !!k && k === process.env.ADMIN_UPLOAD_KEY;
}

/* =========================== GET =========================== */
/**
 * GET /api/chapters?manga_id=...&limit=...&order=asc|desc&by=created_at|number&status=published|ready|draft&all=1
 *
 * По умолчанию — только published. Параметры ?status и ?all учитываются
 * ТОЛЬКО для админа/модератора или при x-api-key=ADMIN_UPLOAD_KEY.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // кто запрашивает
    const isPrivileged =
      allowByApiKey(req) ||
      (await requireRole(req, ['admin', 'moderator']).then((r) => r.ok).catch(() => false));

    const mangaId = Number(url.searchParams.get('manga_id') || url.searchParams.get('mangaId') || 0);
    const rawLimit = Number(url.searchParams.get('limit') || 0);
    const limit = rawLimit ? Math.max(1, Math.min(1000, rawLimit)) : 0;
    const order = (url.searchParams.get('order') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const by = (url.searchParams.get('by') || 'created_at').toLowerCase();

    const hasStatus = await hasColumn('chapters', 'status');

    // разрешим модерации управлять статусом/включать all
    const all = isPrivileged && url.searchParams.has('all');
    const statusParam =
      isPrivileged
        ? (url.searchParams.get('status') || url.searchParams.get('statuses') || '').trim()
        : '';

    const statuses = statusParam
      ? statusParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      : null;

    const orderBy =
      by === 'number'
        ? `coalesce(chapter_number,0) ${order}, created_at desc`
        : `created_at ${order}, coalesce(chapter_number,0) desc`;

    const params: any[] = [];
    const where: string[] = [];

    if (mangaId) {
      params.push(mangaId);
      where.push(`manga_id = $${params.length}`);
    }

    if (hasStatus) {
      // Для обычных пользователей — всегда только published
      let effectiveStatuses: string[] | null = null;
      if (isPrivileged) {
        if (statuses && statuses.length) {
          effectiveStatuses = statuses;
        } else if (!all) {
          effectiveStatuses = ['published'];
        }
      } else {
        effectiveStatuses = ['published'];
      }

      if (effectiveStatuses) {
        params.push(effectiveStatuses);
        where.push(`lower(status) = any($${params.length}::text[])`);
      }
    }

    let sql =
      `select id, manga_id, coalesce(chapter_number,0) as chapter_number,
              coalesce(volume,0) as volume, coalesce(title,'') as title,
              status, pages_count, created_at, updated_at
         from chapters`;
    if (where.length) sql += ` where ${where.join(' and ')}`;
    sql += ` order by ${orderBy}`;
    if (limit) {
      params.push(limit);
      sql += ` limit $${params.length}`;
    }

    const { rows } = await query(sql, params);
    return NextResponse.json({ ok: true, items: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: String(e?.message || e) }, { status: 500 });
  }
}

/* =========================== POST =========================== */
/**
 * POST /api/chapters
 * Body:
 * {
 *   mangaId: number,
 *   chapterNumber: number,
 *   volume?: number,
 *   title?: string|null,
 *   pages?: [{index,key,url?,name?}]   // если переданы — сразу финализируем (как /commit)
 * }
 *
 * Требует: uploader (admin/moderator) или x-api-key == ADMIN_UPLOAD_KEY.
 * Создаёт черновик (status='ready' после загрузки страниц), который НЕ отображается публично.
 */
export async function POST(req: Request) {
  const auth = await requireUploader(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mangaId = Number(body.mangaId ?? body.manga_id ?? 0);
  const chapterNumber = Number(body.chapterNumber ?? body.number ?? 0);
  const volume = Number(body.volume ?? 0);
  const title = (body.title ?? null) as string | null;
  const pages: PageIn[] | null = Array.isArray(body.pages) ? body.pages : null;

  if (!mangaId || !chapterNumber) {
    return NextResponse.json({ ok: false, message: 'mangaId and chapterNumber are required' }, { status: 400 });
  }

  try {
    // динамически собираем список колонок для INSERT
    const cols: string[] = [
      'manga_id',
      'chapter_number',
      'volume',
      'title',
      'status',
      'pages_count',
      'created_at',
      'updated_at',
    ];
    const vals: any[] = [mangaId, chapterNumber, volume, title, 'draft', 0, new Date(), new Date()];

    // если существуют пользовательские колонки — подставим текущего юзера
    const uploaderId = auth.user.id; // uuid (string)
    if (await hasColumn('chapters', 'uploaded_by')) { cols.push('uploaded_by'); vals.push(uploaderId); }
    if (await hasColumn('chapters', 'user_id'))     { cols.push('user_id');     vals.push(uploaderId); }
    if (await hasColumn('chapters', 'created_by'))  { cols.push('created_by');  vals.push(uploaderId); }

    const ph = vals.map((_, i) => `$${i + 1}`).join(', ');
    const ins = await query(
      `insert into chapters (${cols.join(', ')}) values (${ph}) returning id`,
      vals
    );

    const chapterId = Number(ins.rows?.[0]?.id || 0);
    if (!chapterId) throw new Error('failed to create draft');

    const baseKey = `staging/manga/${mangaId}/chapters/${chapterId}`;

    // Если страниц нет — это режим "start": вернём baseKey
    if (!pages || pages.length === 0) {
      return NextResponse.json({ ok: true, chapterId, baseKey });
    }

    // Иначе — сразу "commit"
    const hasCP = await query(
      `select 1 from information_schema.tables
        where table_schema='public' and table_name='chapter_pages' limit 1`
    );
    if (!hasCP.rowCount) {
      throw new Error('table "chapter_pages" is missing — создайте её, см. инструкцию');
    }

    await query(`delete from chapter_pages where chapter_id = $1`, [chapterId]);

    for (const p of pages) {
      const idx = Number(p.index || 0);
      const key = String(p.key || '');
      const url = p.url ? String(p.url) : null;
      const name = p.name ? String(p.name) : null;
      if (!idx || !key) continue;

      await query(
        `insert into chapter_pages (chapter_id, page_index, image_key, image_url, name)
         values ($1,$2,$3,$4,$5)`,
        [chapterId, idx, key, url, name]
      );
    }

    await query(
      `update chapters
          set pages_count = $2,
              status = 'ready',              -- <== видим только в админке, публично скрыто
              updated_at = now()
        where id = $1`,
      [chapterId, pages.length]
    );

    const readUrl = `/manga/${mangaId}/chapter/${chapterId}`;
    return NextResponse.json({ ok: true, chapterId, baseKey, readUrl });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
