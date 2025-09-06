// src/lib/storage/r2-presign.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const accountId = process.env.R2_ACCOUNT_ID!;
const bucket = process.env.R2_BUCKET!;
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
  throw new Error('[R2 presign] Missing env');
}

const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  forcePathStyle: true, // URL вида /<bucket>/<key> — так и нужно для R2
  credentials: { accessKeyId, secretAccessKey },
});

export async function presignPut({
  key,
  contentType,
  cacheControl,
  expiresIn = 60, // сек — сколько живёт подпись
}: {
  key: string;
  contentType: string;
  cacheControl?: string;
  expiresIn?: number;
}) {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key.replace(/^\/+/, ''),
    ContentType: contentType,
    CacheControl: cacheControl,
  });

  const url = await getSignedUrl(s3, cmd, { expiresIn });
  const publicBase = (process.env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');
  const publicUrl = publicBase
    ? `${publicBase}/${key.replace(/^\/+/, '')}`
    : `${endpoint}/${bucket}/${key.replace(/^\/+/, '')}`;

  // Обязательные заголовки, которые должен повторить клиент при PUT:
  const requiredHeaders: Record<string, string> = {
    'Content-Type': contentType,
  };
  if (cacheControl) requiredHeaders['Cache-Control'] = cacheControl;

  return { url, key, publicUrl, headers: requiredHeaders, expiresIn };
}
