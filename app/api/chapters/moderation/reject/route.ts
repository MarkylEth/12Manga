// app/api/chapters/moderation/reject/route.ts
import { NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db';
import { requireRole } from '@/lib/auth/route-guards';
import { deletePrefix, deleteKeys, toKey } from '@/lib/r2';
import { romajiSlug } from '@/lib/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function allowByApiKey(req: Request) {
  const k = req.headers.get('x-api-key')?.trim();
  return !!k && k === process.env.ADMIN_UPLOAD_KEY;
}

async function readChapterId(req: Request, ctx?: { params?: { id?: string } }): Promise<number> {
  const fromParams = Number(ctx?.params?.id || 0);
  if (fromParams) return fromParams;
  
  try {
    const body = await req.json();
    return Number(body?.chapterId || 0);
  } catch {
    return 0;
  }
}

// Исправленная типизация для ctx
export async function POST(req: Request, ctx?: { params?: { id?: string } }) {
  // доступ: api-key ИЛИ роль
  let userIdNum: number | undefined = undefined;
  if (!allowByApiKey(req)) {
    const guard = await requireRole(req, ['admin', 'moderator']);
    if (!guard.ok) {
      return NextResponse.json({ ok: false, message: guard.reason }, { status: guard.status });
    }
    userIdNum = guard.user?.id != null ? Number(guard.user.id) : undefined;
  }

  const chapterIdRaw = await readChapterId(req, ctx);
  if (!chapterIdRaw) {
    return NextResponse.json({ ok: false, message: 'chapterId required' }, { status: 400 });
  }
  const chapterId: number = Number(chapterIdRaw);

  // то, что наполним в транзакции
  let stagingPrefix = '';
  let finalPrefix = '';
  let deletedPages = 0;
  let chapterUpdated = 0;
  let pageKeys: string[] = [];

  try {
    await withTransaction(async (client) => {
      // --- lock главы
      const chRes = await client.query({
        text: `SELECT id, manga_id, chapter_number, volume FROM chapters WHERE id = $1 FOR UPDATE`,
        values: [chapterId],
      });
      
      const ch = chRes.rows[0] as
        | { id: number; manga_id: number; chapter_number: number | null; volume: number | null }
        | undefined;
      
      if (!ch) {
        throw new Error('chapter_not_found');
      }

      // --- ключи страниц (точные) ДО удаления строк
      const pagesRes = await client.query({
        text: `SELECT image_key FROM chapter_pages WHERE chapter_id = $1 ORDER BY page_index ASC`,
        values: [chapterId],
      });
      
      pageKeys = (pagesRes.rows as Array<{ image_key: string | null }>)
        .map((r) => toKey(r.image_key || ''))
        .filter(Boolean);

      // --- данные тайтла для финального префикса
      const mRes = await client.query({
        text: `
          SELECT id, title, title_romaji, original_title,
                 (CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns
                                    WHERE table_schema = 'public' 
                                    AND table_name = 'manga' 
                                    AND column_name = 'slug')
                       THEN slug ELSE NULL END) as slug
            FROM manga WHERE id = $1
        `,
        values: [ch.manga_id],
      });
      
      const m = mRes.rows[0] as
        | { id: number; title: string | null; title_romaji: string | null; original_title: string | null; slug: string | null }
        | undefined;

      const slug = romajiSlug(
        m?.slug || 
        m?.title_romaji || 
        m?.original_title || 
        m?.title || 
        `manga-${m?.id ?? ch.manga_id}`
      ) || `manga-${m?.id ?? ch.manga_id}`;
      
      const vol: number = Number(ch.volume ?? 0);
      const num: number = Number(ch.chapter_number ?? 0);

      stagingPrefix = `staging/manga/${ch.manga_id}/chapters/${chapterId}/`;
      finalPrefix = `manga/${slug}/v${vol}/ch${num}/`;

      // --- чистим страницы из БД
      const delPagesRes = await client.query({
        text: `DELETE FROM chapter_pages WHERE chapter_id = $1`,
        values: [chapterId],
      });
      deletedPages = delPagesRes.rowCount || 0;

      // --- проверяем существование колонок
      const cols = await client.query<{ column_name: string }>(`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema = 'public' 
           AND table_name = 'chapters'
           AND column_name IN ('rejected_by', 'rejected_at', 'review_status')
      `);
      
      const hasRejectedBy = cols.rows.some((r) => r.column_name === 'rejected_by');
      const hasRejectedAt = cols.rows.some((r) => r.column_name === 'rejected_at');
      const hasReview = cols.rows.some((r) => r.column_name === 'review_status');

      // --- формируем части SET запроса
      const setParts: string[] = [
        `status = 'draft'`,
        `pages_count = 0`,
        `updated_at = NOW()`
      ];

      if (hasReview) {
        setParts.push(`review_status = 'rejected'`);
      }
      
      if (hasRejectedAt) {
        setParts.push(`rejected_at = NOW()`);
      }

      const values: any[] = [chapterId];
      
      if (hasRejectedBy) {
        setParts.push(`rejected_by = $2`);
        values.push(userIdNum ?? null);
      }

      // --- обновляем главу
      const updateRes = await client.query({
        text: `UPDATE chapters SET ${setParts.join(', ')} WHERE id = $1`,
        values,
      });
      
      chapterUpdated = updateRes.rowCount || 0;
    });
  } catch (e: any) {
    console.error('Error rejecting chapter:', e);
    const msg = e?.message || String(e);
    const status = msg.includes('chapter_not_found') ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  // ---- R2: удаляем вне транзакции ----
  let deletedExact = 0;
  let removedStaging = 0;
  let removedFinal = 0;
  const r2Errors: string[] = [];

  // 1) точные ключи (если публикация уже успела переложить файлы)
  if (pageKeys.length > 0) {
    try {
      console.log(`Deleting ${pageKeys.length} exact keys:`, pageKeys);
      deletedExact = await deleteKeys(pageKeys);
      console.log(`Successfully deleted ${deletedExact} exact keys`);
    } catch (error) {
      const errorMsg = `Failed to delete exact keys: ${error}`;
      console.error(errorMsg);
      r2Errors.push(errorMsg);
    }
  }

  // 2) staging директория для главы
  if (stagingPrefix) {
    try {
      console.log(`Deleting staging prefix: ${stagingPrefix}`);
      removedStaging = await deletePrefix(stagingPrefix);
      console.log(`Successfully removed ${removedStaging} files from staging`);
    } catch (error) {
      const errorMsg = `Failed to delete staging prefix ${stagingPrefix}: ${error}`;
      console.error(errorMsg);
      r2Errors.push(errorMsg);
    }
  }

  // 3) страховочный снос предполагаемого финального места
  if (finalPrefix) {
    try {
      console.log(`Deleting final prefix: ${finalPrefix}`);
      removedFinal = await deletePrefix(finalPrefix);
      console.log(`Successfully removed ${removedFinal} files from final location`);
    } catch (error) {
      const errorMsg = `Failed to delete final prefix ${finalPrefix}: ${error}`;
      console.error(errorMsg);
      r2Errors.push(errorMsg);
    }
  }

  // Дополнительная попытка удаления всех возможных местоположений
  const additionalPrefixes = [
    `staging/manga/${chapterId}/`,
    `chapters/${chapterId}/`,
    `temp/chapters/${chapterId}/`
  ];

  for (const prefix of additionalPrefixes) {
    try {
      const removed = await deletePrefix(prefix);
      if (removed > 0) {
        console.log(`Additional cleanup: removed ${removed} files from ${prefix}`);
      }
    } catch (error) {
      console.warn(`Additional cleanup failed for ${prefix}:`, error);
    }
  }

  return NextResponse.json({
    ok: true,
    chapterId,
    db: { deletedPages, chapterUpdated },
    r2: { 
      deletedExact, 
      removedStaging, 
      removedFinal,
      errors: r2Errors.length > 0 ? r2Errors : undefined,
      prefixes: {
        staging: stagingPrefix,
        final: finalPrefix
      }
    },
  });
}