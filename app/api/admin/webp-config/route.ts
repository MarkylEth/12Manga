// app/api/admin/webp-config/route.ts
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/route-guards';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface WebPConfig {
  uploadQuality: number;      // качество при загрузке в R2
  publishQuality: number;     // качество при публикации в Wasabi
  maxWidth: number;           // максимальная ширина
  maxHeight: number;          // максимальная высота
  recompressThreshold: number; // выше какого качества реконвертировать
  effort: number;             // усилия Sharp (1-6)
}

const DEFAULT_CONFIG: WebPConfig = {
  uploadQuality: 90,
  publishQuality: 80,
  maxWidth: 1800,
  maxHeight: 2800,
  recompressThreshold: 85,
  effort: 5
};

// Получить текущие настройки
export async function GET(req: Request) {
  const auth = await requireRole(req, ['admin', 'moderator']);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.reason }, { status: auth.status });
  }

  try {
    // Пытаемся получить настройки из БД
    const configResult = await query(`
      SELECT config_value 
      FROM system_config 
      WHERE config_key = 'webp_settings' 
      LIMIT 1
    `).catch(() => ({ rows: [] }));

    let config = DEFAULT_CONFIG;
    
    if (configResult.rows.length > 0) {
      try {
        const stored = JSON.parse(configResult.rows[0].config_value);
        config = { ...DEFAULT_CONFIG, ...stored };
      } catch {
        // Используем настройки по умолчанию если не удается распарсить
      }
    }

    return NextResponse.json({
      ok: true,
      config,
      isDefault: configResult.rows.length === 0
    });

  } catch (error) {
    console.error('[WEBP-CONFIG] Failed to get config:', error);
    return NextResponse.json({
      ok: true,
      config: DEFAULT_CONFIG,
      isDefault: true,
      error: 'Failed to load from DB, using defaults'
    });
  }
}

// Обновить настройки
export async function POST(req: Request) {
  const auth = await requireRole(req, ['admin']);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.reason }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const { config } = body;

    // Валидация
    const errors = [];
    
    if (config.uploadQuality < 10 || config.uploadQuality > 100) {
      errors.push('Upload quality must be between 10-100');
    }
    
    if (config.publishQuality < 10 || config.publishQuality > 100) {
      errors.push('Publish quality must be between 10-100');
    }
    
    if (config.maxWidth < 800 || config.maxWidth > 4000) {
      errors.push('Max width must be between 800-4000');
    }
    
    if (config.maxHeight < 1000 || config.maxHeight > 6000) {
      errors.push('Max height must be between 1000-6000');
    }
    
    if (config.effort < 1 || config.effort > 6) {
      errors.push('Effort must be between 1-6');
    }

    if (errors.length > 0) {
      return NextResponse.json({
        ok: false,
        message: 'Validation failed',
        errors
      }, { status: 400 });
    }

    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const configJson = JSON.stringify(finalConfig);

    // Сохраняем в БД (создаем таблицу если не существует)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS system_config (
          config_key VARCHAR(100) PRIMARY KEY,
          config_value TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW(),
          updated_by INTEGER
        )
      `);

      await query(`
        INSERT INTO system_config (config_key, config_value, updated_by)
        VALUES ('webp_settings', $1, $2)
        ON CONFLICT (config_key) 
        DO UPDATE SET 
          config_value = $1,
          updated_at = NOW(),
          updated_by = $2
      `, [configJson, auth.user?.id || null]);

      console.log('[WEBP-CONFIG] Settings saved:', finalConfig);

    } catch (dbError) {
      console.warn('[WEBP-CONFIG] Failed to save to DB:', dbError);
      // Продолжаем без сохранения в БД
    }

    return NextResponse.json({
      ok: true,
      message: 'WebP configuration updated successfully',
      config: finalConfig
    });

  } catch (error) {
    console.error('[WEBP-CONFIG] Failed to update config:', error);
    return NextResponse.json({
      ok: false,
      message: 'Failed to update configuration',
      error: String(error)
    }, { status: 500 });
  }
}

// Получить статистику использования WebP
export async function PUT(req: Request) {
  const auth = await requireRole(req, ['admin']);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.reason }, { status: auth.status });
  }

  try {
    // Статистика по главам
    const chaptersStats = await query(`
      SELECT 
        COUNT(*) as total_chapters,
        COUNT(CASE WHEN storage = 'wasabi' THEN 1 END) as published_chapters,
        AVG(CASE WHEN webp_compression_ratio > 0 THEN webp_compression_ratio END) as avg_compression_ratio,
        SUM(total_file_size) as total_storage_used
      FROM chapters
    `).then(r => r.rows[0]).catch(() => ({}));

    // Статистика по страницам  
    const pagesStats = await query(`
      SELECT 
        COUNT(*) as total_pages,
        AVG(file_size) as avg_page_size,
        SUM(file_size) as total_pages_size
      FROM chapter_pages
    `).then(r => r.rows[0]).catch(() => ({}));

    // Недавние конвертации
    const recentActivity = await query(`
      SELECT 
        c.id as chapter_id,
        c.status,
        c.published_at,
        c.webp_compression_ratio,
        COUNT(cp.id) as pages_count
      FROM chapters c
      LEFT JOIN chapter_pages cp ON cp.chapter_id = c.id
      WHERE c.updated_at > NOW() - INTERVAL '7 days'
      GROUP BY c.id, c.status, c.published_at, c.webp_compression_ratio
      ORDER BY c.updated_at DESC
      LIMIT 10
    `).then(r => r.rows).catch(() => []);

    return NextResponse.json({
      ok: true,
      stats: {
        chapters: chaptersStats,
        pages: pagesStats,
        recentActivity,
        estimatedSavings: {
          totalSize: Math.round((pagesStats.total_pages_size || 0) / 1024 / 1024), // MB
          avgCompression: Math.round(chaptersStats.avg_compression_ratio || 0),
          estimatedOriginalSize: Math.round(((pagesStats.total_pages_size || 0) * 1.4) / 1024 / 1024) // примерная оценка
        }
      }
    });

  } catch (error) {
    console.error('[WEBP-CONFIG] Failed to get stats:', error);
    return NextResponse.json({
      ok: false,
      error: String(error)
    }, { status: 500 });
  }
}