// lib/storage/publish.ts
import 'server-only';
import sharp from 'sharp';
import {
  GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import {
  r2, wasabi, R2_BUCKET, WASABI_BUCKET, WASABI_PUBLIC_BASE, R2_PUBLIC_BASE,
} from './clients';
import { query, withTransaction } from '@/lib/db';

/* ========== helpers ========== */

const stripStaging = (k: string) => k.replace(/^staging\//, '');
const safeInt = (v: any, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function extToMimeWebP() { return 'image/webp'; }
function pad4(n: number) { return String(n).padStart(4, '0'); }

function keyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\/+/, '').split('/');
    if (parts.length >= 2 && parts[0] === R2_BUCKET) return parts.slice(1).join('/');
    if (R2_PUBLIC_BASE && url.startsWith(R2_PUBLIC_BASE + '/')) {
      return url.slice((R2_PUBLIC_BASE + '/').length);
    }
    const i = url.indexOf('/staging/');
    if (i >= 0) return url.slice(i + 1);
  } catch {}
  return null;
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  if (typeof stream?.transformToByteArray === 'function') {
    return Buffer.from(await stream.transformToByteArray());
  }
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', reject);
  });
}

async function hasColumn(table: string, col: string) {
  const { rowCount } = await query(
    `select 1 from information_schema.columns
      where table_schema='public' and table_name=$1 and column_name=$2 limit 1`,
    [table, col]
  );
  return !!rowCount;
}

async function tableExists(name: string) {
  const { rowCount } = await query(
    `select 1 from information_schema.tables
      where table_schema='public' and table_name=$1 limit 1`,
    [name]
  );
  return !!rowCount;
}

/** Читаем мета главы и слаг тайтла без привязки к конкретным именам колонок */
async function getChapterContext(chapterId: number) {
  const row = await query<any>(`select * from chapters where id=$1 limit 1`, [chapterId])
    .then(r => r.rows?.[0] || null);
  if (!row) throw new Error('chapter not found');

  const mangaId = row.manga_id ?? row.title_id ?? row.manga ?? null;
  if (!mangaId) throw new Error('chapters: manga_id/title_id not found');

  const vol =
    row.volume_index ?? row.volume_number ?? row.vol_number ?? row.volume ?? null;
  const ch =
    row.chapter_index ?? row.chapter_number ?? row.chapter ?? null;

  // slug
  const tables = ['manga', 'titles', 'mangas'];
  const slugCols = ['slug', 'eng_slug', 'url_slug'];
  let slug: string | null = null;
  for (const t of tables) {
    if (!(await tableExists(t))) continue;
    const r = await query<any>(`select * from "${t}" where id=$1 limit 1`, [mangaId]).then(x => x.rows?.[0]);
    if (!r) continue;
    for (const c of slugCols) {
      if (r[c]) { slug = String(r[c]); break; }
    }
    if (slug) break;
  }
  if (!slug) slug = `manga-${mangaId}`;

  return {
    mangaId: safeInt(mangaId),
    volume: vol == null ? 0 : safeInt(vol),
    chapter: ch == null ? 0 : safeInt(ch),
    slug: slug.toString().trim() || `manga-${mangaId}`,
  };
}

function makeDestKey(slug: string, volume: number, chapter: number, index1: number) {
  return `${slug}/vol-${safeInt(volume)}/ch-${safeInt(chapter)}/p${pad4(index1)}.webp`;
}

/**
 * Определяет, нужна ли дополнительная конвертация файла
 * Основано на анализе ключа и метаданных
 */
async function analyzeImageOptimization(key: string) {
  const isWebP = key.toLowerCase().endsWith('.webp');
  const isStaging = key.startsWith('staging/');
  
  // Проверяем метаданные R2 объекта
  try {
    const head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    const metadata = head.Metadata || {};
    
    return {
      isWebP,
      isStaging,
      wasConverted: metadata.compressionRatio !== undefined,
      originalQuality: metadata.webpQuality ? Number(metadata.webpQuality) : undefined,
      needsConversion: !isWebP,
      needsRecompression: isWebP && metadata.webpQuality && Number(metadata.webpQuality) > 85,
      originalSize: metadata.originalSize ? Number(metadata.originalSize) : undefined
    };
  } catch {
    return {
      isWebP,
      isStaging,
      wasConverted: false,
      needsConversion: !isWebP,
      needsRecompression: false
    };
  }
}

/**
 * Конвертирует изображение в оптимизированный WebP для публикации
 */
async function convertToOptimizedWebP(buffer: Buffer, analysis: any) {
  const sharpInstance = sharp(buffer, { failOn: 'none' }).rotate();
  
  // Получаем метаданные
  const meta = await sharpInstance.metadata();
  console.log(`[PUBLISH] Processing image: ${meta.width}x${meta.height}, format: ${meta.format}, size: ${Math.round(buffer.length / 1024)}KB`);
  
  // Применяем ресайз если изображение слишком большое
  let processor = sharpInstance;
  if (meta.width && meta.width > 1800) {
    processor = processor.resize({
      width: 1800,
      withoutEnlargement: true,
      fit: 'inside'
    });
    console.log(`[PUBLISH] Resizing from ${meta.width}px width to max 1800px`);
  }
  
  // Настройки WebP в зависимости от типа обработки
  let webpOptions: any;
  
  if (analysis.needsConversion) {
    // Первичная конвертация из других форматов
    webpOptions = {
      quality: 85,
      effort: 5,
      smartSubsample: true
    };
    console.log(`[PUBLISH] Converting ${meta.format} to WebP (q:85)`);
  } else if (analysis.needsRecompression) {
    // Реконвертация высококачественного WebP
    webpOptions = {
      quality: 75,
      effort: 6,
      smartSubsample: true,
      nearLossless: false
    };
    console.log(`[PUBLISH] Recompressing WebP from q:${analysis.originalQuality} to q:75`);
  } else {
    // Уже оптимизированный WebP
    webpOptions = {
      quality: 80,
      effort: 4
    };
    console.log(`[PUBLISH] Light reprocessing of already optimized WebP`);
  }
  
  const webpBuffer = await processor.webp(webpOptions).toBuffer();
  const finalMeta = await sharp(webpBuffer).metadata();
  
  const savedBytes = buffer.length - webpBuffer.length;
  const compressionRatio = Math.round((savedBytes / buffer.length) * 100);
  
  console.log(`[PUBLISH] Final: ${finalMeta.width}x${finalMeta.height}, ${Math.round(webpBuffer.length / 1024)}KB (${compressionRatio}% compression)`);
  
  return {
    buffer: webpBuffer,
    savedBytes,
    compressionRatio,
    finalWidth: finalMeta.width || 0,
    finalHeight: finalMeta.height || 0
  };
}

/* ========== main ========== */

export async function publishChapterToWasabi(
  chapterId: number,
  { deleteStaging = true, forceReprocess = false } = {}
) {
  console.log(`[PUBLISH] Starting publication of chapter ${chapterId}`);
  
  const ctx = await getChapterContext(chapterId);
  console.log(`[PUBLISH] Chapter context: ${ctx.slug}/vol-${ctx.volume}/ch-${ctx.chapter}`);

  const hasImageKey = await hasColumn('chapter_pages', 'image_key');
  const hasImageUrl = await hasColumn('chapter_pages', 'image_url');

  if (!hasImageKey && !hasImageUrl) {
    throw new Error('chapter_pages: нет ни image_key, ни image_url');
  }

  // читаем страницы; порядок — index/number/id
  const rows = await query<any>(
    `select id,
            ${hasImageKey ? 'image_key' : 'null as image_key'},
            ${hasImageUrl ? 'image_url' : 'null as image_url'},
            page_index, page_number
       from chapter_pages
      where chapter_id=$1
      order by coalesce(page_index, page_number, id) asc`,
    [chapterId]
  ).then(r => r.rows);

  if (!rows.length) throw new Error('no pages to publish');

  console.log(`[PUBLISH] Found ${rows.length} pages to process`);

  // готовим задания (индекс = порядковый по списку)
  const tasks = rows.map((r: any, i: number) => {
    let src = (r.image_key ? String(r.image_key) : '').trim();
    if (!src) {
      const url = r.image_url ? String(r.image_url) : '';
      const k = url ? keyFromUrl(url) : null;
      if (!k) throw new Error(`cannot derive key for page id=${r.id}`);
      src = k;
    }
    const index1 = i + 1;
    const dst = makeDestKey(ctx.slug, ctx.volume, ctx.chapter, index1);
    return { rowId: Number(r.id), src, dst, index1 };
  });

  // Статистика обработки
  let totalOriginalBytes = 0;
  let totalFinalBytes = 0;
  let alreadyOptimized = 0;
  let converted = 0;
  let recompressed = 0;
  let skipped = 0;

  // копирование с интеллектуальной конвертацией -> WebP (concurrency 3)
  let p = 0;
  await Promise.all(Array.from({ length: 3 }).map(async () => {
    while (p < tasks.length) {
      const { src, dst, index1 } = tasks[p++];

      try {
        // уже есть в Wasabi? — пропускаем если не форсируем
        if (!forceReprocess) {
          try { 
            await wasabi.send(new HeadObjectCommand({ Bucket: WASABI_BUCKET, Key: dst })); 
            console.log(`[PUBLISH] Page ${index1}: Already exists in Wasabi, skipping`);
            skipped++;
            continue; 
          } catch {}
        }

        console.log(`[PUBLISH] Page ${index1}: Processing ${src} → ${dst}`);

        // Получаем файл из R2
        const obj = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: src }));
        const input = await streamToBuffer(obj.Body as any);
        totalOriginalBytes += input.length;

        // Анализируем, нужна ли обработка
        const analysis = await analyzeImageOptimization(src);
        console.log(`[PUBLISH] Page ${index1}: Analysis - WebP: ${analysis.isWebP}, converted: ${analysis.wasConverted}, quality: ${analysis.originalQuality}`);

        let finalBuffer: Buffer;
        let processingType: string;

        if (analysis.isWebP && analysis.wasConverted && !analysis.needsRecompression && !forceReprocess) {
          // Файл уже оптимально сконвертирован
          finalBuffer = input;
          processingType = 'already-optimized';
          alreadyOptimized++;
          console.log(`[PUBLISH] Page ${index1}: Using pre-optimized WebP`);
          
        } else {
          // Нужна конвертация или реконвертация
          const conversion = await convertToOptimizedWebP(input, analysis);
          finalBuffer = conversion.buffer;
          
          if (analysis.needsConversion) {
            processingType = 'converted';
            converted++;
          } else {
            processingType = 'recompressed';
            recompressed++;
          }
          
          console.log(`[PUBLISH] Page ${index1}: ${processingType}, saved ${Math.round(conversion.savedBytes / 1024)}KB (${conversion.compressionRatio}%)`);
        }

        totalFinalBytes += finalBuffer.length;

        // Загружаем в Wasabi
        await wasabi.send(new PutObjectCommand({
          Bucket: WASABI_BUCKET,
          Key: dst,
          Body: finalBuffer,
          ContentType: extToMimeWebP(),
          CacheControl: 'public, max-age=31536000, immutable',
          Metadata: {
            chapterId: chapterId.toString(),
            pageIndex: index1.toString(),
            originalKey: src,
            processingType,
            publishedAt: new Date().toISOString(),
            originalSize: input.length.toString(),
            finalSize: finalBuffer.length.toString()
          }
        }));

        console.log(`[PUBLISH] Page ${index1}: Successfully published to Wasabi`);

      } catch (error) {
        console.error(`[PUBLISH] Page ${index1}: Failed to process ${src}:`, error);
        throw error; // Прерываем публикацию при ошибке
      }
    }
  }));

  // Логируем финальную статистику
  const totalSaved = totalOriginalBytes - totalFinalBytes;
  const avgCompression = totalOriginalBytes > 0 ? Math.round((totalSaved / totalOriginalBytes) * 100) : 0;
  
  console.log(`[PUBLISH] Processing complete:`);
  console.log(`[PUBLISH] - Already optimized: ${alreadyOptimized}`);
  console.log(`[PUBLISH] - Converted: ${converted}`);
  console.log(`[PUBLISH] - Recompressed: ${recompressed}`);
  console.log(`[PUBLISH] - Skipped (existing): ${skipped}`);
  console.log(`[PUBLISH] - Total saved: ${Math.round(totalSaved / 1024)}KB (${avgCompression}%)`);

  const wasabiBase = WASABI_PUBLIC_BASE ? `${WASABI_PUBLIC_BASE}/` : null;

  // апдейты БД — ставим новый ключ и url
  await withTransaction(async (client) => {
    for (const t of tasks) {
      const newKey = t.dst;
      const newUrl = wasabiBase ? wasabiBase + newKey : null;

      if (hasImageKey && hasImageUrl) {
        await client.query(
          `update chapter_pages
              set image_key = $2,
                  image_url = coalesce($3, image_url)
            where id = $1`,
          [t.rowId, newKey, newUrl]
        );
      } else if (hasImageKey) {
        await client.query(`update chapter_pages set image_key=$2 where id=$1`, [t.rowId, newKey]);
      } else if (hasImageUrl && newUrl) {
        await client.query(`update chapter_pages set image_url=$2 where id=$1`, [t.rowId, newUrl]);
      }
    }

    // Обновляем статус главы с дополнительной информацией
    const hasWebpStats = await hasColumn('chapters', 'webp_compression_ratio');
    const hasTotalSize = await hasColumn('chapters', 'total_file_size');
    
    let updateParts = [
      `status='published'`,
      `storage='wasabi'`,
      `published_at = coalesce(published_at, now())`,
      `updated_at = now()`
    ];
    
    let updateValues = [chapterId];
    let paramIndex = 2;

    // Добавляем статистику WebP если колонки существуют
    if (hasWebpStats) {
      updateParts.push(`webp_compression_ratio = $${paramIndex}`);
      updateValues.push(avgCompression);
      paramIndex++;
    }
    
    if (hasTotalSize) {
      updateParts.push(`total_file_size = $${paramIndex}`);
      updateValues.push(totalFinalBytes);
      paramIndex++;
    }

    // Проверяем наличие review_status колонки
    const hasReviewStatus = await hasColumn('chapters', 'review_status');
    if (hasReviewStatus) {
      updateParts.push(`review_status='published'`);
    }

    await client.query(
      `update chapters set ${updateParts.join(', ')} where id = $1`,
      updateValues
    );

    console.log(`[PUBLISH] Database updated for chapter ${chapterId}`);
  });

  // удаляем staging-файлы в R2 (все исходники)
  if (deleteStaging) {
    const del = tasks
      .filter(t => t.src.startsWith('staging/'))
      .map(t => ({ Key: t.src }));
      
    if (del.length > 0) {
      console.log(`[PUBLISH] Deleting ${del.length} staging files from R2`);
      
      // Удаляем батчами по 1000
      for (let i = 0; i < del.length; i += 1000) {
        const batch = del.slice(i, i + 1000);
        try {
          const deleteResult = await r2.send(new DeleteObjectsCommand({
            Bucket: R2_BUCKET,
            Delete: { Objects: batch },
          }));
          
          const deletedCount = deleteResult.Deleted?.length || 0;
          console.log(`[PUBLISH] Deleted batch ${Math.floor(i/1000) + 1}: ${deletedCount}/${batch.length} files`);
          
        } catch (deleteError) {
          console.warn(`[PUBLISH] Failed to delete staging batch ${Math.floor(i/1000) + 1}:`, deleteError);
        }
      }
    } else {
      console.log(`[PUBLISH] No staging files to delete`);
    }
  }

  return {
    pages: tasks.length,
    destPrefix: `${ctx.slug}/vol-${ctx.volume}/ch-${ctx.chapter}/`,
    stats: {
      alreadyOptimized,
      converted,
      recompressed,
      skipped,
      totalOriginalBytes,
      totalFinalBytes,
      totalSaved,
      avgCompressionRatio: avgCompression,
      avgSavedPerPage: tasks.length > 0 ? Math.round(totalSaved / tasks.length / 1024) : 0
    }
  };
}