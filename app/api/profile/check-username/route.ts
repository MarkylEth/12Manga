import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const u = (searchParams.get('u') || '').trim();
    // Может быть null или пусто — это нормально
    const selfId = searchParams.get('self');

    // тот же паттерн, что на фронте
    if (!/^[a-z0-9_]{3,20}$/.test(u)) {
      return NextResponse.json({ available: false, reason: 'bad_format' });
    }

    // ВАЖНО: приводим $2 к uuid, чтобы не было uuid <> text
    const sql = `
      select 1
      from public.profiles
      where lower(username) = lower($1)
        and ($2::uuid is null or id <> $2::uuid)
      limit 1
    `;

    const r = await query(sql, [u, selfId]);
    return NextResponse.json({ available: r.rowCount === 0 });
  } catch (e: any) {
    return NextResponse.json(
      { available: false, error: e?.message ?? 'server_error' },
      { status: 500 }
    );
  }
}
