// app/api/admin/manga-moderation/cleanup/route.ts
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/route-guards';
import { query, withTransaction } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUTO_CLEANUP_DAYS = 15;

interface CleanupItem {
  id?: number | null;
  sid?: string | null;
  kind: 'manga' | 'suggestion';
}

async function performAutoCleanup(olderThanDays: number = AUTO_CLEANUP_DAYS, dryRun = false) {
  console.log(`[AUTO-CLEANUP] ==========================================`);
  console.log(`[AUTO-CLEANUP] Starting ${dryRun ? 'DRY RUN' : 'REAL CLEANUP'}`);
  console.log(`[AUTO-CLEANUP] Parameters: olderThanDays=${olderThanDays}, dryRun=${dryRun}`);
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  console.log(`[AUTO-CLEANUP] Cutoff date: ${cutoffDate.toISOString()}`);
  
  if (dryRun) {
    console.log(`[AUTO-CLEANUP] DRY RUN: Only counting items to delete`);
    try {
      // Только подсчитываем что будет удалено
      console.log(`[AUTO-CLEANUP] Querying suggestions count...`);
      const suggestionCount = await query(`
        SELECT COUNT(*) as count
        FROM title_submissions 
        WHERE status IN ('approved', 'rejected')
          AND reviewed_at < $1
      `, [cutoffDate]).then(r => {
        const count = Number(r.rows[0]?.count || 0);
        console.log(`[AUTO-CLEANUP] Found ${count} suggestions to delete`);
        return count;
      }).catch(err => {
        console.error(`[AUTO-CLEANUP] Error querying suggestions:`, err);
        throw new Error(`Failed to query suggestions: ${err.message}`);
      });

      console.log(`[AUTO-CLEANUP] Querying orphaned manga count...`);
      const orphanCount = await query(`
        SELECT COUNT(*) as count
        FROM manga 
        WHERE created_at < $1
          AND NOT EXISTS (SELECT 1 FROM chapters WHERE chapters.manga_id = manga.id)
          AND id NOT IN (
            SELECT DISTINCT manga_id 
            FROM title_submissions 
            WHERE manga_id IS NOT NULL 
              AND status = 'approved'
              AND reviewed_at > $2
          )
      `, [cutoffDate, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]).then(r => {
        const count = Number(r.rows[0]?.count || 0);
        console.log(`[AUTO-CLEANUP] Found ${count} orphaned manga to delete`);
        return count;
      }).catch(err => {
        console.error(`[AUTO-CLEANUP] Error querying orphaned manga:`, err);
        throw new Error(`Failed to query orphaned manga: ${err.message}`);
      });

      const totalWouldDelete = suggestionCount + orphanCount;
      console.log(`[AUTO-CLEANUP] DRY RUN RESULT: Would delete ${totalWouldDelete} items total`);

      return {
        success: true,
        dryRun: true,
        wouldDelete: totalWouldDelete,
        deleted: 0,
        cutoffDate: cutoffDate.toISOString(),
        details: {
          suggestions: suggestionCount,
          orphanedManga: orphanCount
        }
      };
    } catch (error) {
      console.error('[AUTO-CLEANUP] DRY RUN FAILED:', error);
      return {
        success: false,
        dryRun: true,
        wouldDelete: 0,
        deleted: 0,
        error: String(error),
        message: `Dry run failed: ${error}`
      };
    }
  }

  console.log(`[AUTO-CLEANUP] Starting real cleanup operation`);
  let totalDeleted = 0;
  const deletedItems: any[] = [];
  const errors: string[] = [];

  try {
    await withTransaction(async (client) => {
      console.log(`[AUTO-CLEANUP] Starting database transaction`);
      
      // Удаляем старые отработанные заявки из title_submissions
      try {
        console.log(`[AUTO-CLEANUP] Deleting suggestions...`);
        const suggestionsResult = await client.query(`
          DELETE FROM title_submissions 
          WHERE status IN ('approved', 'rejected')
            AND reviewed_at < $1
          RETURNING id, status, payload->'title_ru' as title
        `, [cutoffDate]);

        const deletedSuggestions = suggestionsResult.rowCount || 0;
        totalDeleted += deletedSuggestions;
        
        console.log(`[AUTO-CLEANUP] Deleted ${deletedSuggestions} old suggestions`);
        if (deletedSuggestions > 0) {
          deletedItems.push(...suggestionsResult.rows.map(r => ({ 
            type: 'suggestion', 
            id: r.id, 
            title: r.title 
          })));
        }
      } catch (suggestionError) {
        const errorMsg = `Failed to delete suggestions: ${suggestionError.message}`;
        console.error(`[AUTO-CLEANUP] ${errorMsg}`);
        errors.push(errorMsg);
      }

      // Опционально: очищаем старые одобренные манги без глав
      try {
        console.log(`[AUTO-CLEANUP] Deleting orphaned manga...`);
        const orphanMangaResult = await client.query(`
          DELETE FROM manga 
          WHERE created_at < $1
            AND NOT EXISTS (SELECT 1 FROM chapters WHERE chapters.manga_id = manga.id)
            AND id NOT IN (
              SELECT DISTINCT manga_id 
              FROM title_submissions 
              WHERE manga_id IS NOT NULL 
                AND status = 'approved'
                AND reviewed_at > $2
            )
          RETURNING id, title
        `, [cutoffDate, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]);

        const deletedOrphans = orphanMangaResult.rowCount || 0;
        totalDeleted += deletedOrphans;
        
        console.log(`[AUTO-CLEANUP] Deleted ${deletedOrphans} orphaned manga entries`);
        if (deletedOrphans > 0) {
          deletedItems.push(...orphanMangaResult.rows.map(r => ({ 
            type: 'orphaned_manga', 
            id: r.id, 
            title: r.title 
          })));
        }
      } catch (orphanError) {
        const errorMsg = `Failed to delete orphaned manga: ${orphanError.message}`;
        console.error(`[AUTO-CLEANUP] ${errorMsg}`);
        errors.push(errorMsg);
      }

      console.log(`[AUTO-CLEANUP] Transaction completed successfully`);
    });

    console.log(`[AUTO-CLEANUP] Real cleanup completed: ${totalDeleted} items deleted`);
    
    return {
      success: true,
      deleted: totalDeleted,
      deletedItems,
      errors: errors.length > 0 ? errors : undefined,
      cutoffDate: cutoffDate.toISOString()
    };

  } catch (error) {
    console.error('[AUTO-CLEANUP] Transaction failed:', error);
    return {
      success: false,
      deleted: 0,
      deletedItems: [],
      errors: [String(error)],
      error: `Database transaction failed: ${error.message || error}`,
      cutoffDate: cutoffDate.toISOString()
    };
  }
}

export async function DELETE(req: Request) {
  console.log('[CLEANUP] ===========================================');
  console.log('[CLEANUP] DELETE request received at:', new Date().toISOString());
  console.log('[CLEANUP] Request headers:', Object.fromEntries(req.headers.entries()));
  console.log('[CLEANUP] Request URL:', req.url);
  
  try {
    // Проверяем авторизацию (кроме автоматических запросов)
    const isAutoCleanup = req.headers.get('x-auto-cleanup') === 'true';
    console.log('[CLEANUP] Is auto cleanup:', isAutoCleanup);
    
    if (!isAutoCleanup) {
      console.log('[CLEANUP] Checking admin authorization...');
      const auth = await requireRole(req, ['admin']);
      console.log('[CLEANUP] Auth result:', auth);
      if (!auth.ok) {
        console.log('[CLEANUP] Auth failed:', auth.reason);
        return NextResponse.json({ 
          ok: false, 
          error: auth.reason,
          debug: 'Authorization failed'
        }, { status: auth.status });
      }
      console.log('[CLEANUP] Authorization successful');
    }

    // Читаем тело запроса
    let body: any = {};
    try {
      console.log('[CLEANUP] Reading request body...');
      const rawBody = await req.text();
      console.log('[CLEANUP] Raw request body:', rawBody);
      console.log('[CLEANUP] Body length:', rawBody.length);
      
      if (rawBody && rawBody.trim()) {
        body = JSON.parse(rawBody);
        console.log('[CLEANUP] Parsed body successfully:', JSON.stringify(body, null, 2));
      } else {
        console.log('[CLEANUP] Empty body, using defaults');
      }
    } catch (parseError) {
      console.error('[CLEANUP] Failed to parse request body:', parseError);
      return NextResponse.json({
        ok: false,
        error: 'Invalid JSON in request body',
        debug: {
          parseError: String(parseError),
          rawBody: (await req.text()).substring(0, 200)
        }
      }, { status: 400 });
    }

    console.log('[CLEANUP] Parsed body:', body);

    const { 
      items, 
      olderThanDays = AUTO_CLEANUP_DAYS, 
      dryRun = false,
      autoCleanup = isAutoCleanup 
    } = body;

    console.log('[CLEANUP] Final parameters:', { 
      hasItems: !!items && Array.isArray(items), 
      itemsLength: items ? items.length : 0,
      olderThanDays, 
      dryRun, 
      autoCleanup 
    });

    // Проверяем корректность параметров
    if (olderThanDays < 1 || olderThanDays > 365) {
      console.error('[CLEANUP] Invalid olderThanDays:', olderThanDays);
      return NextResponse.json({
        ok: false,
        error: 'Invalid olderThanDays parameter (must be 1-365)',
        debug: { olderThanDays }
      }, { status: 400 });
    }

    // Если передан конкретный список элементов (ручное удаление)
    if (items && Array.isArray(items) && !autoCleanup) {
      console.log(`[CLEANUP] Manual cleanup: ${items.length} specific items`);
      
      let deletedCount = 0;
      const errors: string[] = [];
      const deletedItems: any[] = [];

      if (!dryRun) {
        await withTransaction(async (client) => {
          for (const item of items as CleanupItem[]) {
            try {
              let result;
              
              if (item.kind === 'suggestion' && item.sid) {
                result = await client.query(`
                  DELETE FROM title_submissions 
                  WHERE id = $1 
                    AND status IN ('approved', 'rejected')
                  RETURNING id, status, payload->'title_ru' as title
                `, [item.sid]);
              }

              if (result && result.rowCount && result.rowCount > 0) {
                deletedCount += result.rowCount;
                deletedItems.push({
                  ...item,
                  deletedData: result.rows[0]
                });
                console.log(`[CLEANUP] Deleted ${item.kind} ${item.sid}: ${result.rows[0]?.title}`);
              }

            } catch (itemError) {
              const errorMsg = `Failed to delete ${item.kind} ${item.sid}: ${itemError}`;
              console.error(`[CLEANUP] ${errorMsg}`);
              errors.push(errorMsg);
            }
          }
        });
      }

      return NextResponse.json({
        ok: true,
        deleted: dryRun ? 0 : deletedCount,
        wouldDelete: dryRun ? items.length : undefined,
        deletedItems: dryRun ? [] : deletedItems,
        errors: errors.length > 0 ? errors : undefined,
        type: 'manual',
        dryRun
      });
    }

    // Автоматическая очистка
    console.log(`[CLEANUP] ${autoCleanup ? 'Auto' : 'Manual'} cleanup: older than ${olderThanDays} days, dry run: ${dryRun}`);
    
    const result = await performAutoCleanup(olderThanDays, dryRun);

    const response = {
      ok: result.success,
      deleted: result.deleted,
      wouldDelete: result.dryRun ? result.wouldDelete : undefined,
      deletedItems: result.deletedItems || [],
      errors: result.errors && result.errors.length > 0 ? result.errors : undefined,
      type: autoCleanup ? 'auto' : 'manual',
      dryRun,
      message: result.success 
        ? (dryRun 
            ? `Would delete ${result.wouldDelete || 0} processed submissions`
            : `Successfully deleted ${result.deleted} processed submissions`)
        : (result.error || 'Cleanup failed'),
      debug: {
        cutoffDate: result.cutoffDate,
        olderThanDays,
        autoCleanup,
        details: result.details
      }
    };

    console.log('[CLEANUP] Final response:', JSON.stringify(response, null, 2));
    console.log('[CLEANUP] ===========================================');
    return NextResponse.json(response);

  } catch (error) {
    console.error('[CLEANUP] ===========================================');
    console.error('[CLEANUP] UNEXPECTED ERROR:', error);
    console.error('[CLEANUP] Error type:', typeof error);
    console.error('[CLEANUP] Error name:', error?.constructor?.name);
    console.error('[CLEANUP] Error message:', error?.message);
    console.error('[CLEANUP] Error stack:', error?.stack);
    console.error('[CLEANUP] ===========================================');
    
    return NextResponse.json({
      ok: false,
      error: String(error),
      message: 'Cleanup operation failed unexpectedly',
      debug: {
        errorType: typeof error,
        errorName: error?.constructor?.name,
        timestamp: new Date().toISOString()
      }
    }, { status: 500 });
  }
}

// Получить информацию о последней автоочистке и статистику
export async function GET(req: Request) {
  console.log('[CLEANUP] GET request for stats');
  
  try {
    const url = new URL(req.url);
    const olderThanDays = Number(url.searchParams.get('olderThanDays') || AUTO_CLEANUP_DAYS);
    const isTest = url.searchParams.get('test') === '1';
    
    if (isTest) {
      return NextResponse.json({
        ok: true,
        message: 'API is working',
        timestamp: new Date().toISOString()
      });
    }

    console.log('[CLEANUP] Getting stats for', olderThanDays, 'days');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Получаем информацию о последней автоочистке (если таблица существует)
    let lastCleanup = null;
    try {
      const lastCleanupResult = await query(`
        SELECT config_value 
        FROM system_config 
        WHERE config_key = 'last_auto_cleanup'
      `);
      
      if (lastCleanupResult.rows.length > 0) {
        try {
          lastCleanup = JSON.parse(lastCleanupResult.rows[0].config_value);
          console.log('[CLEANUP] Found last cleanup record:', lastCleanup);
        } catch (parseError) {
          console.error('[CLEANUP] Failed to parse last cleanup data:', parseError);
        }
      }
    } catch (tableError) {
      console.log('[CLEANUP] system_config table not found - this is normal for new installations');
    }

    // Считаем отработанные заявки для удаления
    const suggestionStats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        MIN(reviewed_at) as oldest_reviewed
      FROM title_submissions 
      WHERE status IN ('approved', 'rejected')
        AND reviewed_at < $1
    `, [cutoffDate]).then(r => r.rows[0]).catch(err => {
      console.error('[CLEANUP] Failed to get suggestion stats:', err);
      return { total: 0, approved: 0, rejected: 0, oldest_reviewed: null };
    });

    // Проверяем, когда была последняя автоочистка
    const daysSinceLastCleanup = lastCleanup?.timestamp 
      ? Math.floor((Date.now() - new Date(lastCleanup.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const needsAutoCleanup = daysSinceLastCleanup === null || daysSinceLastCleanup >= AUTO_CLEANUP_DAYS;

    const response = {
      ok: true,
      autoCleanupDays: AUTO_CLEANUP_DAYS,
      cutoffDate: cutoffDate.toISOString(),
      olderThanDays,
      lastCleanup,
      daysSinceLastCleanup,
      needsAutoCleanup,
      stats: {
        suggestions: suggestionStats,
        total: {
          total: Number(suggestionStats.total),
          approved: Number(suggestionStats.approved),
          rejected: Number(suggestionStats.rejected)
        }
      },
      message: Number(suggestionStats.total) > 0 
        ? `Found ${suggestionStats.total} processed items older than ${olderThanDays} days`
        : `No processed items older than ${olderThanDays} days found`
    };

    console.log('[CLEANUP] Stats response:', response);
    return NextResponse.json(response);

  } catch (error) {
    console.error('[CLEANUP] Failed to get cleanup stats:', error);
    return NextResponse.json({
      ok: false,
      error: String(error),
      message: 'Failed to load cleanup statistics'
    }, { status: 500 });
  }
}