// app/api/manga/[id]/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalize(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title ?? row.title_ru ?? row.name ?? row.original_title ?? 'Без названия',
    cover_url: row.cover_url ?? row.cover ?? null,
    author: row.author ?? null,
    artist: row.artist ?? null,
    description: row.description ?? null,
    status: row.status ?? null,
    release_year: row.release_year ?? null,
    rating: row.rating ?? null,
    rating_count: row.rating_count ?? null,
    original_title: row.original_title ?? null,
    title_romaji: row.title_romaji ?? null,
    tags: row.tags ?? null,
  };
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;                 // <-- ждём params
  const raw = String(id ?? '');

  const idMatch = raw.match(/^\d+/);
  const numericId = idMatch ? parseInt(idMatch[0], 10) : Number.NaN;
  const slug = raw.replace(/^\d+-?/, '').trim().toLowerCase();

  try {
    if (Number.isFinite(numericId)) {
      const r = await query(`select * from manga where id = $1 limit 1`, [numericId]);
      const item = normalize(r.rows?.[0]);
      if (item) return NextResponse.json({ ok: true, item });
    }

    if (slug) {
      const r2 = await query(
        `select * from manga
         where lower(coalesce(slug,'')) = $1
            or regexp_replace(lower(coalesce(title_romaji,'')), '[^a-z0-9]+','-','g') = $1
            or regexp_replace(lower(coalesce(original_title,'')), '[^a-z0-9]+','-','g') = $1
         limit 1`,
        [slug],
      );
      const item2 = normalize(r2.rows?.[0]);
      return NextResponse.json({ ok: true, item: item2 ?? null });
    }

    return NextResponse.json({ ok: true, item: null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, item: null, error: e?.message ?? 'Internal error' });
  }
}
