// lib/utils.ts
// Маленькие утилиты без внешних зависимостей

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function assert(cond: any, msg = 'Assertion failed'): asserts cond {
  if (!cond) throw new Error(msg);
}

export function defined<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

export function safeJson<T = any>(val: unknown, fallback: T): T {
  try {
    if (typeof val === 'string') return JSON.parse(val) as T;
  } catch { /* ignore */ }
  return fallback;
}

/** безопасный парс числа из query/форм */
export function toInt(v: unknown, d = 0) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

/** объект -> querystring без пустых */
export function toQuery(params: Record<string, any>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.set(k, String(v));
  });
  return sp.toString();
}
