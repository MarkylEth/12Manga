// lib/normalize.ts
// Универсальные нормализаторы строк/массивов/поиска

/** чистим пробелы, невидимые символы, нормализуем регистр */
export function normalizeText(s: unknown): string {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')          // неразрывные пробелы -> обычные
    .replace(/\s+/g, ' ')             // многократные пробелы -> один
    .trim();
}

/** для поиска: нижний регистр + без диакритики */
export function normalizeSearch(s: unknown): string {
  const t = normalizeText(s).toLowerCase();
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** CSV/строка в массив строк */
export function toStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => normalizeText(x)).filter(Boolean);
  if (typeof v === 'string') {
    return v
      .split(/[,\n;]+/g)
      .map(x => normalizeText(x))
      .filter(Boolean);
  }
  return [];
}

/** ограничить число в диапазоне */
export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
