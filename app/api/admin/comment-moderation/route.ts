// app/api/admin/comment-moderation/route.ts
import { NextResponse } from 'next/server'
// import { many, query } from '@/lib/db' // подключим, когда определим схему

/** GET: список комментов на модерации */
export async function GET() {
  try {
    // TODO: заменить на SELECT из таблиц comments + флаги модерации
    const items: Array<{
      id: string
      manga_id?: number | null
      page_id?: number | null
      created_at?: string
      user_id?: string | null
      comment: string
      flags?: string[]
    }> = []

    return NextResponse.json({ ok: true, items })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}

/** POST: действие модератора (approve/reject/delete) */
export async function POST(req: Request) {
  try {
    const { id, action, reason } = await req.json().catch(() => ({}))
    if (!id || !action) {
      return NextResponse.json({ ok: false, error: 'id and action are required' }, { status: 400 })
    }

    // TODO: выполнить UPDATE/DELETE в зависимости от action
    // await query('UPDATE comments SET ... WHERE id=$1', [id])

    return NextResponse.json({ ok: true, id, action, reason: reason ?? null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}
