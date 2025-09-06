// app/api/admin/manga/approve/route.ts
import { NextResponse } from 'next/server'
// import { withTx } from '@/lib/db'

/** POST: апрув конкретного тайтла (ожидаем body: { id }) */
export async function POST(req: Request) {
  try {
    const { id } = await req.json().catch(() => ({}))
    if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })

    // TODO: транзакция: перенести из стейджинга в публичную таблицу / обновить флаг
    // await withTx(async (cx) => { ... })

    return NextResponse.json({ ok: true, id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}
