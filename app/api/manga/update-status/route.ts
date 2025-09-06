// app/api/manga/update-status/route.ts
import { NextResponse } from 'next/server'

/**
 * POST /api/manga/update-status
 * Body: { id: number, status: 'ongoing'|'completed'|'paused'|string }
 */
export async function POST(req: Request) {
  try {
    const { id, status } = await req.json().catch(() => ({}))
    if (!id || !status) {
      return NextResponse.json({ ok: false, error: 'id and status are required' }, { status: 400 })
    }

    // TODO: UPDATE manga SET status=$2 WHERE id=$1
    // await query('UPDATE manga SET status=$2 WHERE id=$1', [id, status])

    return NextResponse.json({ ok: true, id, status })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}
