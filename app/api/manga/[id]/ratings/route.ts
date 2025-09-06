// app/api/manga/[id]/ratings/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { params: { id: string } };

/** GET: список оценок по тайтлу */
export async function GET(_req: Request, { params }: Params) {
  try {
    const mangaId = Number(params.id);
    if (!Number.isFinite(mangaId)) {
      return NextResponse.json({ ok: false, message: 'Bad id' }, { status: 400 });
    }

    const r = await query<{
      id: string;
      manga_id: number;
      user_id: string;
      rating: number;
      created_at: string;
      updated_at: string | null;
    }>(
      `
      SELECT id, manga_id, user_id, rating, created_at, updated_at
      FROM manga_ratings
      WHERE manga_id = $1
      ORDER BY created_at ASC
      `,
      [mangaId],
    );

    return NextResponse.json(
      { ok: true, items: r.rows.map(({ user_id, ...rest }) => rest) }, // фронту user_id не нужен
      { status: 200 },
    );
  } catch (e: any) {
    console.error('[ratings][GET] error:', e);
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 });
  }
}

/** POST: поставить/обновить оценку (1..10) для текущего пользователя */
export async function POST(req: Request, { params }: Params) {
  try {
    const mangaId = Number(params.id);
    if (!Number.isFinite(mangaId)) {
      return NextResponse.json({ ok: false, message: 'Bad id' }, { status: 400 });
    }

    const token = cookies().get(SESSION_COOKIE)?.value;
    const sess = await verifySession(token);
    if (!sess) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rating = Number(body?.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
      return NextResponse.json({ ok: false, message: 'Rating must be 1..10' }, { status: 422 });
    }

    // Upsert без необходимости уникального индекса
    const up = await query<{ id: string }>(
      `
      WITH upd AS (
        UPDATE manga_ratings
        SET rating = $3, updated_at = NOW()
        WHERE manga_id = $1 AND user_id = $2
        RETURNING id
      ),
      ins AS (
        INSERT INTO manga_ratings (manga_id, user_id, rating)
        SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM upd)
        RETURNING id
      )
      SELECT COALESCE((SELECT id FROM upd), (SELECT id FROM ins)) AS id
      `,
      [mangaId, sess.sub, rating],
    );

    const id = up.rows[0]?.id || null;
    return NextResponse.json({ ok: true, id, manga_id: mangaId, rating }, { status: 200 });
  } catch (e: any) {
    console.error('[ratings][POST] error:', e);
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 });
  }
}
