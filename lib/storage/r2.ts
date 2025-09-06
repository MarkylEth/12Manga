// src/lib/storage/r2.ts
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import dns from 'dns';
import { Readable } from 'stream';

// ====== ENV ======
const accountId = process.env.R2_ACCOUNT_ID!;
const bucket = process.env.R2_BUCKET!;
const endpoint =
  process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
const region = 'auto';
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
const publicBase = (process.env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');

// Тогглы для TLS/сетевых особенностей
const TLS_MODE = (process.env.R2_TLS || '12').trim(); // '12' | 'auto'
const HTTP2_OFF = String(process.env.R2_HTTP2 || '0') === '0'; // 0=off, 1=on
const INSECURE = String(process.env.R2_INSECURE || 'false').toLowerCase() === 'true'; // allow self-signed
const IPV4FIRST = String(process.env.R2_IPV4FIRST || 'true').toLowerCase() === 'true'; // prefer IPv4

if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
  throw new Error('[R2] Missing env: R2_ACCOUNT_ID/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY');
}

// Предпочесть IPv4 (часто помогает на Windows/провайдерах)
if (IPV4FIRST && (dns as any).setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const hostname = new URL(endpoint).hostname;

// ====== HTTPS агент (переключаемый) ======
const httpsAgent = new https.Agent({
  keepAlive: true,
  // TLS режим: только 1.2 (по умолчанию) или авто (1.2–1.3)
  minVersion: TLS_MODE === 'auto' ? 'TLSv1.2' : 'TLSv1.2',
  maxVersion: TLS_MODE === 'auto' ? 'TLSv1.3' : 'TLSv1.2',
  // Явный SNI
  servername: hostname,
  // Отключаем h2 — иногда ALPN ломает рукопожатие
  ALPNProtocols: HTTP2_OFF ? ['http/1.1'] : undefined,
  // Временно разрешить «невалидные» цепочки (если антивирус/прокси подменяет сертификат)
  rejectUnauthorized: !INSECURE,
});

export const r2 = new S3Client({
  region,
  endpoint,                 // https://<account>.r2.cloudflarestorage.com
  forcePathStyle: true,     // /bucket/key
  requestHandler: new NodeHttpHandler({ httpsAgent }),
  credentials: { accessKeyId, secretAccessKey },
});

const norm = (k: string) => k.replace(/^\/+/, '');

export function r2PublicUrl(key: string) {
  return publicBase ? `${publicBase}/${norm(key)}` : `${endpoint}/${bucket}/${norm(key)}`;
}

export async function r2PutBuffer(
  key: string,
  buf: Buffer,
  contentType: string,
  cache = 'public, max-age=604800'
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: norm(key),
      Body: buf,
      ContentType: contentType,
      CacheControl: cache,
    })
  );
  return r2PublicUrl(key);
}

export async function r2GetBuffer(key: string): Promise<Buffer> {
  const res = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: norm(key) }));
  const body = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
  }
  return Buffer.concat(chunks);
}

export async function r2Remove(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: norm(key) }));
}
