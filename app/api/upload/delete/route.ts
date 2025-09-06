// app/api/upload/delete/route.ts
export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { wasabi } from '@/lib/wasabi';

export async function POST(req: NextRequest) {
  try {
    const { key, url } = await req.json().catch(() => ({}));

    const objKey = key ?? extractKeyFromUrl(url);
    if (!objKey) {
      return Response.json({ ok: false, error: 'key or url is required' }, { status: 400 });
    }

    await wasabi.send(
      new (await import('@aws-sdk/client-s3')).DeleteObjectCommand({
        Bucket: process.env.WASABI_BUCKET!,
        Key: objKey,
      })
    );

    return Response.json({ ok: true, key: objKey });
  } catch (e: any) {
    console.error(e);
    return Response.json({ ok: false, error: e?.message ?? 'delete_failed' }, { status: 500 });
  }
}

function extractKeyFromUrl(u?: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    // ключ — всё после hostname
    return url.pathname.replace(/^\/+/, '') || null;
  } catch {
    return null;
  }
}
