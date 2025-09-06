// app/api/manga/[id]/library/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function jserr(e: any, status = 500) {
  return NextResponse.json(
    { ok: false, error: 'internal_error', message: e?.message, code: e?.code, detail: e?.detail },
    { status }
  );
}

const ALLOWED_STATUS = new Set(['planned', 'reading', 'completed', 'dropped']);

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const me = await getAuthUser(req);
    if (!me?.id) return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });

    const mangaId = Number(ctx.params.id);
    if (!Number.isFinite(mangaId)) return NextResponse.json({ ok: false, message: 'Bad id' }, { status: 400 });

    const { rows } = await query(
      `SELECT manga_id, status::text AS status, is_favorite AS favorite
         FROM user_library
        WHERE user_id = $1 AND manga_id = $2
        LIMIT 1`,
      [me.id, mangaId]
    );
    return NextResponse.json({ ok: true, item: rows[0] ?? null });
  } catch (e: any) {
    return jserr(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const me = await getAuthUser(req);
    if (!me?.id) return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });

    const mangaId = Number(ctx.params.id);
    if (!Number.isFinite(mangaId)) return NextResponse.json({ ok: false, message: 'Bad id' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const hasStatus = typeof body.status === 'string';
    const hasFav = typeof body.favorite === 'boolean';
    if (!hasStatus && !hasFav) {
      return NextResponse.json({ ok: false, message: 'Nothing to update' }, { status: 400 });
    }

    let status: string | null = null;
    if (hasStatus) {
      status = String(body.status).trim();
      if (status && !ALLOWED_STATUS.has(status)) {
        return NextResponse.json({ ok: false, message: 'Invalid status' }, { status: 400 });
      }
    }
    const favorite: boolean | null = hasFav ? !!body.favorite : null;

    // обновить или вставить
    const upd = await query(
      `UPDATE user_library
          SET status      = COALESCE($3::read_status, status),
              is_favorite = COALESCE($4, is_favorite),
              updated_at  = NOW()
        WHERE user_id = $1 AND manga_id = $2
        RETURNING manga_id, status::text AS status, is_favorite AS favorite`,
      [me.id, mangaId, status, favorite]
    );

    if (upd.rowCount) return NextResponse.json({ ok: true, item: upd.rows[0] });

    const ins = await query(
      `INSERT INTO user_library (user_id, manga_id, status, is_favorite)
       VALUES ($1, $2, $3::read_status, COALESCE($4, false))
       RETURNING manga_id, status::text AS status, is_favorite AS favorite`,
      [me.id, mangaId, status, favorite]
    );

    return NextResponse.json({ ok: true, item: ins.rows[0] ?? null });
  } catch (e: any) {
    return jserr(e);
  }
}
