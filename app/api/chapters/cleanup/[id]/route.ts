// app/api/chapters/cleanup/[id]/route.ts
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/route-guards';
import { deletePrefix, listObjects } from '@/lib/r2';
import { romajiSlug } from '@/lib/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  // Только для админов и модераторов
  const guard = await requireRole(req, ['admin', 'moderator']);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, message: guard.reason }, { status: guard.status });
  }

  const chapterId = Number(ctx.params.id);
  if (!chapterId) {
    return NextResponse.json({ ok: false, message: 'Invalid chapter ID' }, { status: 400 });
  }

  try {
    // Ищем все возможные местоположения файлов главы
    const prefixesToCheck = [
      `staging/manga/${chapterId}/`,
      `chapters/${chapterId}/`,
      `temp/chapters/${chapterId}/`,
    ];

    // Также пытаемся найти финальное местоположение через БД
    const { query } = await import('@/lib/db');
    
    try {
      const result = await query(`
        SELECT 
          c.id, c.manga_id, c.chapter_number, c.volume,
          m.title, m.title_romaji, m.original_title,
          (CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns
                             WHERE table_schema = 'public' 
                             AND table_name = 'manga' 
                             AND column_name = 'slug')
                THEN m.slug ELSE NULL END) as slug
        FROM chapters c
        JOIN manga m ON m.id = c.manga_id
        WHERE c.id = $1
      `, [chapterId]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const slug = romajiSlug(
          row.slug || 
          row.title_romaji || 
          row.original_title || 
          row.title || 
          `manga-${row.manga_id}`
        ) || `manga-${row.manga_id}`;
        
        const vol = Number(row.volume ?? 0);
        const num = Number(row.chapter_number ?? 0);
        const finalPrefix = `manga/${slug}/v${vol}/ch${num}/`;
        
        prefixesToCheck.push(finalPrefix);
      }
    } catch (dbError) {
      console.warn('Failed to get chapter info from DB:', dbError);
    }

    const results = [];
    let totalDeleted = 0;

    for (const prefix of prefixesToCheck) {
      try {
        console.log(`Checking prefix: ${prefix}`);
        
        // Сначала проверяем, есть ли файлы
        const objects = await listObjects(prefix);
        if (objects.length === 0) {
          results.push({ prefix, deleted: 0, status: 'empty' });
          continue;
        }

        console.log(`Found ${objects.length} objects in ${prefix}`);
        
        // Удаляем файлы
        const deleted = await deletePrefix(prefix);
        totalDeleted += deleted;
        
        results.push({ 
          prefix, 
          deleted, 
          status: 'success',
          foundObjects: objects.length
        });
        
        console.log(`Successfully deleted ${deleted} objects from ${prefix}`);
        
      } catch (error) {
        console.error(`Error processing prefix ${prefix}:`, error);
        results.push({ 
          prefix, 
          deleted: 0, 
          status: 'error', 
          error: String(error) 
        });
      }
    }

    return NextResponse.json({
      ok: true,
      chapterId,
      totalDeleted,
      results,
      message: totalDeleted > 0 
        ? `Successfully deleted ${totalDeleted} files` 
        : 'No files found to delete'
    });

  } catch (error) {
    console.error('Cleanup failed:', error);
    return NextResponse.json({
      ok: false,
      error: String(error)
    }, { status: 500 });
  }
}