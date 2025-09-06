// app/api/admin/manga/list/route.ts
import { NextResponse } from 'next/server'
import { toInt } from '@/lib/utils'
// import { many, one } from '@/lib/db'

/** GET: список тайтлов с пагинацией (для админки) */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, toInt(searchParams.get('page'), 1))
    const limit = Math.min(100, Math.max(1, toInt(searchParams.get('limit'), 20)))
    const q = (searchParams.get('q') || '').trim()

    // TODO: SELECT из manga c фильтром q, пагинацией и total
    const items: Array<{
      id: number
      title: string
      created_at?: string
      updated_at?: string | null
      status?: string | null
    }> = []
    const total = 0

    return NextResponse.json({ ok: true, items, meta: { page, limit, total } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}
