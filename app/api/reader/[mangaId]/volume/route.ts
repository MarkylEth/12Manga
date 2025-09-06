import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = {
  id: number;
  manga_id: number;
  chapter_number: number | null;
  volume: number | null;
  title: string | null;
  pages_count: number | null;
};

export async function GET(_req: Request, { params }: { params: { mangaId: string } }) {
  try {
    const r = await query<Row>(
      `
      select
        id,
        manga_id,
        coalesce(chapter_number::numeric,
                 nullif(regexp_replace(coalesce(chapter::text, number::text, ''), '[^0-9\\.]', '', 'g'), '')::numeric
        ) as chapter_number,
        coalesce(volume_number, volume) as volume,
        title,
        pages_count
      from chapters
      where manga_id = $1
      order by coalesce(volume_number, volume) nulls last,
               coalesce(chapter_number, id)
      `,
      [params.mangaId]
    );

    // группируем по тому
    const map = new Map<number | 'none', any[]>();
    for (const x of r.rows) {
      const key = x.volume != null ? Number(x.volume) : ('none' as const);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({
        id: Number(x.id),
        number: x.chapter_number != null ? Number(x.chapter_number) : 0,
        title: x.title ?? null,
        pages: x.pages_count != null ? Number(x.pages_count) : null,
      });
    }

    const volumes = Array.from(map.entries())
      .map(([k, chapters]) => ({
        volume: k === 'none' ? null : Number(k),
        label: k === 'none' ? 'Без тома' : `Том ${k}`,
        chapters,
      }))
      .sort((a, b) => {
        // тома по возрастанию, "без тома" в конце
        if (a.volume == null && b.volume != null) return 1;
        if (a.volume != null && b.volume == null) return -1;
        return (a.volume ?? 1e9) - (b.volume ?? 1e9);
      });

    return NextResponse.json({ ok: true, volumes });
  } catch (e: any) {
    return NextResponse.json({ ok: true, volumes: [], error: e?.message });
  }
}
