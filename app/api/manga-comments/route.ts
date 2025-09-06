// app/api/manga-comments/route.ts
import { NextResponse } from 'next/server';
import { toInt } from '@/lib/utils';

// GET /api/manga-comments?mangaId=123&limit=200
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mangaId = toInt(searchParams.get('mangaId'));
    const limit = Math.min(200, Math.max(1, toInt(searchParams.get('limit'), 100)));
    if (!mangaId) return NextResponse.json({ ok: false, error: 'mangaId is required' }, { status: 400 });

    // TODO: SELECT из comments WHERE manga_id=$1 ORDER BY created_at ASC LIMIT $2
    const items: any[] = [];
    return NextResponse.json({ ok: true, items, meta: { limit } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 });
  }
}

// POST: временно отключено (нужен кастомный auth)
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Posting comments is disabled until custom auth is ready' },
    { status: 403 },
  );
}
