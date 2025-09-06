// app/api/manga/list/route.ts
import { NextResponse } from 'next/server'
import { toInt } from '@/lib/utils'
// import { many, one } from '@/lib/db'

/**
 * GET /api/manga/list?page=1&limit=24&q=
 * Список тайтлов с базовой информацией (админ/пользовательский список).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, toInt(searchParams.get('page'), 1))
    const limit = Math.min(100, Math.max(1, toInt(searchParams.get('limit'), 24)))
    const q = (searchParams.get('q') || '').trim()

    // TODO: SELECT id,title,cover_url,status,release_year FROM manga WHERE ... ORDER BY created_at DESC LIMIT/OFFSET
    const items: Array<{
      id: number
      title: string
      cover_url?: string | null
      status?: string | null
      release_year?: number | null
      created_at?: string
    }> = []
    const total = 0

    return NextResponse.json({ ok: true, items, meta: { page, limit, total }, filter: { q } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}
