// app/api/teams/search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Row = { id: number; name: string; slug: string | null }

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim()
    const limitParam = Number(url.searchParams.get('limit') ?? '10')
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 20) : 10

    let rows: Row[] = []

    if (q.length > 0) {
      // Поиск по name OR slug (регистронезависимо), как было в Supabase .or(name.ilike, slug.ilike)
      // Используем параметризованный запрос для безопасности
      const like = `%${q}%`
      const sql = `
        SELECT id, name, slug
        FROM translator_teams
        WHERE name ILIKE $1 OR slug ILIKE $1
        ORDER BY
          -- немножко "умности": точные совпадения выше, затем по длине
          CASE WHEN name ILIKE $2 OR slug ILIKE $2 THEN 0 ELSE 1 END,
          length(name) ASC
        LIMIT $3
      `
      const exact = q // для ^...$ через ILIKE = просто сравним равенство ниже/выше
      const { rows: data } = await query<Row>(sql, [like, exact, limit])
      rows = data
    } else {
      // Без фильтра: просто последние добавленные (или любые топ-10, чтобы сохранить поведение "limit 10")
      const { rows: data } = await query<Row>(
        `SELECT id, name, slug
         FROM translator_teams
         ORDER BY created_at DESC NULLS LAST, id DESC
         LIMIT $1`,
        [limit]
      )
      rows = data
    }

    return NextResponse.json({ ok: true, items: rows })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    )
  }
}
