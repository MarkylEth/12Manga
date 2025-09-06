// lib/asList.ts
// Нормализует вход в массив: null/undefined -> [], одиночное значение -> [value]

export function asList<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// С гарантией типов, без undefined/null внутри
export function compact<T>(arr: (T | null | undefined)[]): T[] {
  return arr.filter((x): x is T => x != null);
}
