// app/api/page-comments/route.ts
import { NextResponse } from 'next/server';
import { toInt } from '@/lib/utils';

// GET /api/page-comments?pageId=123&limit=200
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const pageId = toInt(searchParams.get('pageId'));
    const limit = Math.min(200, Math.max(1, toInt(searchParams.get('limit'), 100)));
    if (!pageId) return NextResponse.json({ ok: false, error: 'pageId is required' }, { status: 400 });

    // TODO: SELECT из page_comments WHERE page_id=$1 ORDER BY created_at ASC LIMIT $2
    const items: any[] = [];
    return NextResponse.json({ ok: true, items, meta: { limit } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 });
  }
}

// POST — выключено до включения кастомного auth
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Posting comments is disabled until custom auth is ready' },
    { status: 403 },
  );
}
