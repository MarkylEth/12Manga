// app/api/r2/presign/route.ts
import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,          // https://<account>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

export async function POST(req: Request) {
  const { key, contentType, cacheControl, expiresIn } = await req.json();
  const cmd = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
    CacheControl: cacheControl || 'public, max-age=31536000, immutable',
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn: Math.min(900, Number(expiresIn)||60) });
  return NextResponse.json({
    ok: true,
    url,
    key,
    publicUrl: process.env.R2_PUBLIC_BASE_URL ? `${process.env.R2_PUBLIC_BASE_URL}/${key}` : undefined,
    headers: { 'Content-Type': contentType || 'application/octet-stream',
               'Cache-Control': cacheControl || 'public, max-age=31536000, immutable' },
  });
}
