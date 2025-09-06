// lib/list.ts
// Общие типы и хелперы для list-ответов REST.

export type ListMeta = {
  total?: number;   // общее количество (если считали)
  page?: number;    // текущая страница с 1
  limit?: number;   // размер страницы
};

export type ListResponse<T> = {
  ok: true;
  items: T[];
  meta?: ListMeta;
};

export function listResponse<T>(items: T[], meta?: ListMeta): ListResponse<T> {
  return { ok: true, items, ...(meta ? { meta } : {}) };
}

// Пагинация произвольного массива (для in-memory/черновых данных)
export function paginate<T>(items: readonly T[], page = 1, limit = 20) {
  const p = Math.max(1, page | 0);
  const l = Math.max(1, limit | 0);
  const start = (p - 1) * l;
  const end = start + l;
  return {
    slice: items.slice(start, end),
    meta: { total: items.length, page: p, limit: l } as ListMeta,
  };
}
