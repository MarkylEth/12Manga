import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth/route-guards';

async function safeCount(sql: string, params: any[] = []) {
  try {
    const { rows } = await query<{ c: string | number }>(`select coalesce((${sql}),0) as c`, params);
    return Number(rows?.[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function GET(req: Request) {
  const auth = await requireRole(req, ['admin', 'moderator']);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.reason || 'forbidden' }, { status: auth.status });
  }

  // считаем, где это возможно
  const [
    users,
    manga,
    chapters,
    pending,   // ждут модерации
    drafts,
    today,
    comments,
  ] = await Promise.all([
    safeCount(`select count(*) from profiles`),
    safeCount(`select count(*) from manga`),
    safeCount(`select count(*) from chapters`),
    safeCount(`select count(*) from chapters where lower(status) in ('ready')`),
    safeCount(`select count(*) from chapters where lower(status) in ('draft')`),
    safeCount(`select count(*) from chapters where date(created_at) = current_date`),
    safeCount(`select count(*) from manga_comments`),
  ]);

  return NextResponse.json({
    ok: true,
    stats: {
      users,
      manga,
      chapters,
      pendingChapters: pending,
      draftChapters: drafts,
      todayUploads: today,
      comments,
    },
  });
}
