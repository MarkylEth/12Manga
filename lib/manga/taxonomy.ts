// lib/manga/taxonomy.ts
// Совместимый слой для таксономии тайтлов.
// Раньше, вероятно, бралось из Supabase. Теперь — либо константы,
// либо реэкспорт из общего модуля.

export { GENRES, TAGS } from '@/lib/taxonomy';

/** Нормализация строки тега/жанра */
export function normalizeToken(s: string): string {
  return s
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Преобразование произвольного поля в массив жанров */
export function toGenres(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).map(normalizeToken).filter(Boolean);
  if (typeof input === 'string') {
    return input
      .split(/[;,/|]+|\n/g)
      .map((x) => x.replace(/^#/, ''))
      .map(normalizeToken)
      .filter(Boolean);
  }
  return [];
}

/** Преобразование произвольного поля в массив тегов */
export function toTags(input: unknown): string[] {
  return toGenres(input);
}

/** Красивый вывод: первая буква — заглавная */
export function pretty(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
