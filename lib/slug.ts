// lib/slug.ts
// Слаги для тайтлов и глава/маршрутов

import { normalizeText } from './normalize';

/** упрощённый транслит/ромадзи: латиница+цифры+дефис */
export function romajiSlug(source: unknown): string {
  const s = normalizeText(source)
    .toLowerCase()
    // заменяем кириллицу/японские символы на латиницу максимально просто
    .replace(/[а-яё]/g, (ch) =>
      (
        { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z',
          и:'i', й:'i', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r',
          с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'ts', ч:'ch', ш:'sh',
          щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya'
        } as Record<string, string>
      )[ch] ?? ''
    )
    .replace(/[^a-z0-9]+/g, '-')   // всё прочее -> дефис
    .replace(/^-+|-+$/g, '')       // обрезаем края
    .replace(/-{2,}/g, '-');       // схлопываем дефисы
  return s || 'title';
}

/** slug c id, например 1234-fullmetal-alchemist */
export function makeIdSlug(id: number | string, titleLike: unknown): string {
  const slug = romajiSlug(titleLike);
  return `${id}-${slug}`.replace(/^-+/, '');
}

/** разбираем "1234-something" -> { id: 1234, rest: "something" } */
export function parseIdSlug(s: string): { id: number | null; rest: string } {
  const m = String(s || '').match(/^(\d+)(?:-(.*))?$/);
  if (!m) return { id: null, rest: '' };
  return { id: Number(m[1]), rest: m[2] ?? '' };
}
