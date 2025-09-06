// app/api/cron/cleanup-submissions/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vercel Cron или внешний cron может вызывать этот эндпоинт
export async function POST(req: Request) {
  console.log('[CRON-CLEANUP] Automated cleanup job started');
  
  try {
    // Проверяем, что это запрос от cron (можно добавить секретный ключ)
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;
    
    if (expectedSecret && cronSecret !== expectedSecret) {
      console.log('[CRON-CLEANUP] Invalid cron secret');
      return NextResponse.json({
        ok: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    // Вызываем эндпоинт очистки с автоматическим флагом
    const cleanupResponse = await fetch(`${req.url.replace('/cron/cleanup-submissions', '/admin/manga-moderation/cleanup')}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-auto-cleanup': 'true'
      },
      body: JSON.stringify({
        dryRun: false,
        force: false
      })
    });

    const cleanupResult = await cleanupResponse.json();

    if (!cleanupResponse.ok || !cleanupResult.ok) {
      throw new Error(cleanupResult.message || 'Cleanup failed');
    }

    console.log(`[CRON-CLEANUP] Completed: ${cleanupResult.deleted} items deleted`);

    // Логируем результат для мониторинга
    if (cleanupResult.deleted > 0) {
      console.log(`[CRON-CLEANUP] Successfully deleted ${cleanupResult.deleted} processed submissions`);
    } else {
      console.log('[CRON-CLEANUP] No items to delete');
    }

    return NextResponse.json({
      ok: true,
      cronJob: true,
      timestamp: new Date().toISOString(),
      deleted: cleanupResult.deleted,
      message: `Cron cleanup completed: ${cleanupResult.deleted} items processed`
    });

  } catch (error) {
    console.error('[CRON-CLEANUP] Cron job failed:', error);
    
    return NextResponse.json({
      ok: false,
      cronJob: true,
      timestamp: new Date().toISOString(),
      error: String(error),
      message: 'Cron cleanup failed'
    }, { status: 500 });
  }
}

// GET - для проверки статуса cron задачи
export async function GET(req: Request) {
  try {
    const { query } = await import('@/lib/db');
    
    // Получаем информацию о последних запусках
    const lastCleanup = await query(`
      SELECT config_value, updated_at
      FROM system_config 
      WHERE config_key = 'last_auto_cleanup'
      ORDER BY updated_at DESC
      LIMIT 1
    `).then(r => r.rows[0]).catch(() => null);

    let parsedCleanup = null;
    if (lastCleanup) {
      try {
        parsedCleanup = JSON.parse(lastCleanup.config_value);
      } catch {}
    }

    // Проверяем текущую статистику для очистки
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 15);
    
    const currentStats = await query(`
      SELECT 
        COUNT(*) as eligible_for_cleanup,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_old,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_old
      FROM title_submissions 
      WHERE status IN ('approved', 'rejected')
        AND reviewed_at IS NOT NULL
        AND reviewed_at < $1
    `, [cutoffDate]).then(r => r.rows[0]);

    const daysSinceLastCleanup = parsedCleanup?.timestamp 
      ? Math.floor((Date.now() - new Date(parsedCleanup.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return NextResponse.json({
      ok: true,
      cronStatus: {
        lastRun: parsedCleanup?.timestamp || null,
        daysSinceLastRun: daysSinceLastCleanup,
        lastRunDeleted: parsedCleanup?.deletedCount || 0,
        nextRunDue: daysSinceLastCleanup !== null ? Math.max(0, 15 - daysSinceLastCleanup) : 0
      },
      currentEligible: {
        total: Number(currentStats?.eligible_for_cleanup || 0),
        approved: Number(currentStats?.approved_old || 0),
        rejected: Number(currentStats?.rejected_old || 0)
      },
      autoCleanupDays: 15,
      cutoffDate: cutoffDate.toISOString()
    });

  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: String(error)
    }, { status: 500 });
  }
}