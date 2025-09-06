// app/api/editManga/route.ts
import { NextResponse } from 'next/server'
// import { query } from '@/lib/db'

/**
 * POST /api/editManga
 * Body: { id: number, patch: { title?: string, ... } }
 * Пока просто эхо-ответ без записи в БД.
 */
export async function POST(req: Request) {
  try {
    const { id, patch } = await req.json().catch(() => ({}))
    if (!id || typeof patch !== 'object') {
      return NextResponse.json({ ok: false, error: 'id and patch are required' }, { status: 400 })
    }

    // TODO: UPDATE manga SET ... WHERE id=$1
    // await query('UPDATE manga SET title=$2, ... WHERE id=$1', [id, ...])

    return NextResponse.json({ ok: true, id, patch })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}
