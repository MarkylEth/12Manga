// lib/r2.ts
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  type _Object as S3Object,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';

export const R2_BUCKET =
  process.env.R2_BUCKET ??
  process.env.R2_PUBLIC_BUCKET ??
  'mp-staging';

const R2_ENDPOINT = process.env.R2_ENDPOINT || '';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: String(process.env.R2_ACCESS_KEY_ID || ''),
    secretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY || ''),
  },
});

/** Нормализуем url → key (поддерживает http(s) и r2://bucket/key) */
export function toKey(raw: string): string {
  if (!raw) return '';
  let s = raw.replace(/^https?:\/\/[^/]+\/?/i, '');
  s = s.replace(/^r2:\/\/[^/]+\/?/i, '');
  s = s.replace(/^\/+/, '');
  return s;
}

/** HEAD: существует ли объект */
export async function head(key: string): Promise<boolean> {
  if (!key) return false;
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Копия + удаление (S3 style move) */
export async function moveObject(fromKey: string, toKey: string): Promise<void> {
  if (!fromKey || !toKey || fromKey === toKey) return;
  // CopySource должен быть URL-encoded, если есть пробелы/юникод
  const copySource = encodeURI(`${R2_BUCKET}/${fromKey}`);
  await r2.send(
    new CopyObjectCommand({
      Bucket: R2_BUCKET,
      Key: toKey,
      CopySource: copySource,
    }),
  );
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: fromKey }));
}

/** Список объектов по префиксу (возвращаем S3Object[]) - добавлен алиас для совместимости */
export async function listPrefix(prefix: string): Promise<S3Object[]> {
  const out: S3Object[] = [];
  
  if (!prefix) {
    console.warn('listPrefix called with empty prefix');
    return out;
  }

  // нормализуем: хотим, чтобы префикс заканчивался на '/'
  const norm = prefix.endsWith('/') ? prefix : `${prefix}/`;
  console.log(`[R2] Listing objects with prefix: ${norm} in bucket: ${R2_BUCKET}`);

  let ContinuationToken: string | undefined = undefined;
  let totalFound = 0;
  
  try {
    do {
      const resp: ListObjectsV2CommandOutput = await r2.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET,
          Prefix: norm,
          ContinuationToken,
          MaxKeys: 1000,
        }),
      );
      
      const objects = (resp.Contents ?? []) as S3Object[];
      for (const o of objects) {
        if (o?.Key) {
          out.push(o);
          totalFound++;
        }
      }
      
      ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (ContinuationToken);

    console.log(`[R2] Found ${totalFound} objects with prefix: ${norm}`);
    return out;
    
  } catch (error) {
    console.error(`[R2] Error listing objects with prefix ${norm}:`, error);
    throw error;
  }
}

/** Алиас для совместимости с вашим кодом */
export const listObjects = listPrefix;

/** Удалить пачкой ключи (вернёт число удалённых) */
export async function deleteKeys(keys: string[]): Promise<number> {
  if (!keys.length) {
    console.log('[R2] deleteKeys called with empty array');
    return 0;
  }

  console.log(`[R2] Deleting ${keys.length} keys:`, keys.slice(0, 10)); // показываем первые 10
  
  let deleted = 0;
  const errors: string[] = [];
  
  try {
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      console.log(`[R2] Deleting chunk ${Math.floor(i / 1000) + 1}, ${chunk.length} keys`);
      
      const res = await r2.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: { 
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: false // Получаем подробную информацию об ошибках
          },
        }),
      );
      
      const chunkDeleted = res.Deleted?.length ?? 0;
      deleted += chunkDeleted;
      
      console.log(`[R2] Successfully deleted ${chunkDeleted} objects from chunk`);
      
      // Проверяем ошибки удаления
      if (res.Errors && res.Errors.length > 0) {
        for (const error of res.Errors) {
          const errorMsg = `Key: ${error.Key}, Code: ${error.Code}, Message: ${error.Message}`;
          console.error(`[R2] Delete error: ${errorMsg}`);
          errors.push(errorMsg);
        }
      }
    }
    
    console.log(`[R2] Total deleted: ${deleted} out of ${keys.length} keys`);
    
    if (errors.length > 0) {
      throw new Error(`Some deletions failed: ${errors.join('; ')}`);
    }
    
    return deleted;
    
  } catch (error) {
    console.error('[R2] Error in deleteKeys:', error);
    throw error;
  }
}

/** Удалить всё по префиксу (вернёт число удалённых) */
export async function deletePrefix(prefix: string): Promise<number> {
  if (!prefix) {
    console.warn('[R2] deletePrefix called with empty prefix');
    return 0;
  }

  console.log(`[R2] Starting deletePrefix for: ${prefix}`);
  
  try {
    const objs = await listPrefix(prefix);
    
    if (objs.length === 0) {
      console.log(`[R2] No objects found with prefix: ${prefix}`);
      return 0;
    }
    
    const keys = objs.map((o) => o.Key!).filter(Boolean);
    console.log(`[R2] Found ${keys.length} objects to delete with prefix: ${prefix}`);
    
    if (keys.length === 0) {
      console.log(`[R2] No valid keys found for prefix: ${prefix}`);
      return 0;
    }
    
    const deleted = await deleteKeys(keys);
    console.log(`[R2] Deleted ${deleted} objects with prefix: ${prefix}`);
    
    return deleted;
    
  } catch (error) {
    console.error(`[R2] Error in deletePrefix for ${prefix}:`, error);
    throw error;
  }
}

/** Удалить один объект (на всякий случай) */
export async function deleteOne(key: string): Promise<void> {
  if (!key) return;
  
  console.log(`[R2] Deleting single object: ${key}`);
  
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    console.log(`[R2] Successfully deleted: ${key}`);
  } catch (error) {
    console.error(`[R2] Error deleting ${key}:`, error);
    throw error;
  }
}

/** Проверка подключения и настроек R2 */
export async function testR2Connection(): Promise<{
  success: boolean;
  bucket: string;
  endpoint: string;
  error?: string;
}> {
  try {
    console.log(`[R2] Testing connection to bucket: ${R2_BUCKET} at ${R2_ENDPOINT}`);
    
    // Пробуем получить список объектов с пустым префиксом
    const resp = await r2.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: '',
        MaxKeys: 1,
      }),
    );
    
    console.log('[R2] Connection test successful');
    
    return {
      success: true,
      bucket: R2_BUCKET,
      endpoint: R2_ENDPOINT,
    };
    
  } catch (error) {
    console.error('[R2] Connection test failed:', error);
    
    return {
      success: false,
      bucket: R2_BUCKET,
      endpoint: R2_ENDPOINT,
      error: String(error),
    };
  }
}