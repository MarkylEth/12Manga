// app/api/upload/route.ts
// Загрузка обложек в Wasabi с конвертацией в .webp (вся статика в одной папке)

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import crypto from 'crypto';

const {
  WASABI_ACCESS_KEY_ID,
  WASABI_SECRET_ACCESS_KEY,
  WASABI_BUCKET,
  WASABI_REGION,
  WASABI_ENDPOINT,
  WASABI_PUBLIC_BASE_URL,
  WASABI_COVERS_FOLDER = 'covers',
} = process.env;

if (
  !WASABI_ACCESS_KEY_ID ||
  !WASABI_SECRET_ACCESS_KEY ||
  !WASABI_BUCKET ||
  !WASABI_REGION ||
  !WASABI_ENDPOINT
) {
  throw new Error('Wasabi ENV is not fully set');
}

const s3 = new S3Client({
  region: WASABI_REGION,
  endpoint: WASABI_ENDPOINT,
  credentials: {
    accessKeyId: WASABI_ACCESS_KEY_ID,
    secretAccessKey: WASABI_SECRET_ACCESS_KEY,
  },
  forcePathStyle: false,
});

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/gif',
]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function randName() {
  return crypto.randomBytes(8).toString('hex');
}

function publicUrl(key: string) {
  const base =
    WASABI_PUBLIC_BASE_URL ||
    `${WASABI_ENDPOINT!.replace('https://', `https://${WASABI_BUCKET}.`)}`;
  return `${base}/${key}`.replace(/([^:]\/)\/+/g, '$1');
}

export async function POST(req: Request) {
  try {
    const ct = req.headers.get('content-type') || '';
    if (!ct.toLowerCase().startsWith('multipart/form-data')) {
      return NextResponse.json(
        { ok: false, error: 'multipart/form-data expected' },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = (form.get('file') || form.get('cover')) as File | null;
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'file (or cover) is required' },
        { status: 400 }
      );
    }

    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: `Unsupported type: ${file.type}` },
        { status: 400 }
      );
    }

    const src = Buffer.from(await file.arrayBuffer());
    if (src.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `File too large (>${MAX_BYTES} bytes)` },
        { status: 413 }
      );
    }

    // конвертация в webp (овер-ориентация, мягкий ресайз)
    const base = sharp(src, { failOn: 'none' }).rotate();
    const meta = await base.metadata();
    const resized =
      meta.width && meta.width > 1200
        ? base.resize({ width: 1200, withoutEnlargement: true })
        : base;

    const webp = await resized.webp({ quality: 82 }).toBuffer();
    const outMeta = await sharp(webp).metadata();

    const key = `${WASABI_COVERS_FOLDER}/${Date.now()}-${randName()}.webp`;
    await s3.send(
      new PutObjectCommand({
        Bucket: WASABI_BUCKET!,
        Key: key,
        Body: webp,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
        // ACL: 'public-read', // обычно не нужно, если в бакете стоит публичная policy
      })
    );

    const url = publicUrl(key);
    return NextResponse.json({
      ok: true,
      url,
      key,
      name: file.name,
      originalType: file.type,
      size: webp.length,
      width: outMeta.width ?? null,
      height: outMeta.height ?? null,
      contentType: 'image/webp',
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Upload failed' },
      { status: 500 }
    );
  }
}
