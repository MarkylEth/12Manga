// app/api/admin/title-suggestions/route.ts
import { NextResponse } from 'next/server'
// import { many } from '@/lib/db'

/** GET: список «подсказок»/кандидатов в тайтлы (например, собранных извне) */
export async function GET() {
  try {
    // TODO: SELECT из таблицы title_suggestions (если есть) или вернуть пусто
    const items: Array<{
      id: number | string
      title: string
      source?: string | null
      created_at?: string
    }> = []

    return NextResponse.json({ ok: true, items })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}
