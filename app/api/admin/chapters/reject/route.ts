// app/api/admin/chapters/reject/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  console.log('[MINIMAL-REJECT] Starting request processing');
  
  try {
    // Читаем тело запроса
    let body: any;
    try {
      body = await req.json();
      console.log('[MINIMAL-REJECT] Body parsed:', JSON.stringify(body));
    } catch (parseError) {
      console.error('[MINIMAL-REJECT] Body parse error:', parseError);
      return NextResponse.json({
        ok: false,
        message: 'Invalid JSON body',
        error: String(parseError)
      }, { status: 400 });
    }

    const chapterId = Number(body?.chapterId ?? 0);
    console.log('[MINIMAL-REJECT] Chapter ID:', chapterId);

    if (!chapterId) {
      console.log('[MINIMAL-REJECT] No chapter ID provided');
      return NextResponse.json({
        ok: false,
        message: 'chapterId required'
      }, { status: 400 });
    }

    // Пытаемся импортировать и использовать query функцию
    console.log('[MINIMAL-REJECT] Attempting to import query function');
    
    let queryFunction: any;
    try {
      const dbModule = await import('@/lib/db');
      queryFunction = dbModule.query;
      console.log('[MINIMAL-REJECT] Query function imported successfully');
    } catch (importError) {
      console.error('[MINIMAL-REJECT] Failed to import query function:', importError);
      return NextResponse.json({
        ok: false,
        message: 'Database module import failed',
        error: String(importError)
      }, { status: 500 });
    }

    // Пробуем простой тестовый запрос
    console.log('[MINIMAL-REJECT] Testing database connection');
    try {
      const testResult = await queryFunction('SELECT 1 as test');
      console.log('[MINIMAL-REJECT] Database test successful:', testResult.rows[0]);
    } catch (dbError) {
      console.error('[MINIMAL-REJECT] Database test failed:', dbError);
      return NextResponse.json({
        ok: false,
        message: 'Database connection failed',
        error: String(dbError)
      }, { status: 500 });
    }

    // Проверяем, существует ли глава
    console.log('[MINIMAL-REJECT] Checking if chapter exists');
    let chapterInfo: any;
    try {
      const chapterResult = await queryFunction(
        'SELECT id, manga_id, status, pages_count FROM chapters WHERE id = $1',
        [chapterId]
      );
      
      if (chapterResult.rows.length === 0) {
        console.log('[MINIMAL-REJECT] Chapter not found');
        return NextResponse.json({
          ok: false,
          message: 'Chapter not found'
        }, { status: 404 });
      }
      
      chapterInfo = chapterResult.rows[0];
      console.log('[MINIMAL-REJECT] Chapter found:', JSON.stringify(chapterInfo));
    } catch (chapterError) {
      console.error('[MINIMAL-REJECT] Chapter query failed:', chapterError);
      return NextResponse.json({
        ok: false,
        message: 'Failed to query chapter',
        error: String(chapterError)
      }, { status: 500 });
    }

    // Удаляем страницы главы
    console.log('[MINIMAL-REJECT] Deleting chapter pages');
    let deletedPages = 0;
    try {
      const deletePagesResult = await queryFunction(
        'DELETE FROM chapter_pages WHERE chapter_id = $1',
        [chapterId]
      );
      
      deletedPages = deletePagesResult.rowCount || 0;
      console.log('[MINIMAL-REJECT] Deleted pages:', deletedPages);
    } catch (pagesError) {
      console.error('[MINIMAL-REJECT] Failed to delete pages:', pagesError);
      return NextResponse.json({
        ok: false,
        message: 'Failed to delete chapter pages',
        error: String(pagesError)
      }, { status: 500 });
    }

    // Удаляем саму главу из БД
    console.log('[MINIMAL-REJECT] Deleting chapter from database');
    let chapterDeleted = false;
    try {
      const deleteChapterResult = await queryFunction(
        'DELETE FROM chapters WHERE id = $1',
        [chapterId]
      );
      
      chapterDeleted = (deleteChapterResult.rowCount || 0) > 0;
      console.log('[MINIMAL-REJECT] Chapter deleted from DB:', chapterDeleted);
    } catch (deleteError) {
      console.error('[MINIMAL-REJECT] Failed to delete chapter:', deleteError);
      return NextResponse.json({
        ok: false,
        message: 'Failed to delete chapter',
        error: String(deleteError)
      }, { status: 500 });
    }

    // Пробуем очистить R2 (без критических ошибок)
    console.log('[MINIMAL-REJECT] Attempting R2 cleanup');
    let r2Result = { attempted: false, deleted: 0, errors: [] };
    
    try {
      const r2Module = await import('@/lib/r2');
      console.log('[MINIMAL-REJECT] R2 module imported');
      
      // Пробуем удалить staging директорию
      const stagingPrefix = `staging/manga/${chapterInfo.manga_id}/chapters/${chapterId}/`;
      console.log('[MINIMAL-REJECT] Attempting to delete:', stagingPrefix);
      
      const deleted = await r2Module.deletePrefix(stagingPrefix);
      console.log('[MINIMAL-REJECT] R2 cleanup result:', deleted);
      
      r2Result = {
        attempted: true,
        deleted,
        errors: []
      };
    } catch (r2Error) {
      console.warn('[MINIMAL-REJECT] R2 cleanup failed (non-critical):', r2Error);
      r2Result = {
        attempted: true,
        deleted: 0,
        errors: [String(r2Error)]
      };
    }

    const response = {
      ok: true,
      chapterId,
      chapterInfo,
      db: {
        chapterDeleted,
        deletedPages
      },
      r2: r2Result,
      message: 'Chapter rejected and deleted successfully'
    };

    console.log('[MINIMAL-REJECT] Success response:', JSON.stringify(response));
    return NextResponse.json(response);

  } catch (unexpectedError) {
    console.error('[MINIMAL-REJECT] Unexpected error:', unexpectedError);
    console.error('[MINIMAL-REJECT] Error stack:', unexpectedError instanceof Error ? unexpectedError.stack : 'No stack trace');
    
    return NextResponse.json({
      ok: false,
      message: 'Unexpected server error',
      error: String(unexpectedError),
      stack: unexpectedError instanceof Error ? unexpectedError.stack : undefined
    }, { status: 500 });
  }
}