// lib/team/titles.ts

export type TeamTitle = {
  id: number;
  name: string;
  slug?: string | null;
  cover_url?: string | null;
  status?: string | null;
  chapters_count?: number;
  rating?: number;
  last_update?: string;
};

function pickStr(o: any, keys: string[], fallback = ''): string {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && String(v).trim().length) return String(v);
  }
  return fallback;
}

function pickNullableStr(o: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && String(v).trim().length) return String(v);
  }
  return null;
}

export function mapTitleRow(row: any): TeamTitle {
  return {
    id: Number(row.id),
    name: pickStr(row, ['title', 'name'], 'Без названия'),
    slug: pickNullableStr(row, ['slug']),
    cover_url: pickNullableStr(row, ['cover_url']),
    status: pickNullableStr(row, ['status']),
    chapters_count: row.chapters_count || 0,
    rating: row.rating || 0,
    last_update: row.updated_at || row.created_at,
  };
}