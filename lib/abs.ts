// lib/abs.ts
import { headers } from 'next/headers';

export function abs(path: string) {
  // нормализуем слэш
  const p = path.startsWith('/') ? path : `/${path}`;

  const h = headers();
  const host =
    h.get('x-forwarded-host') ??
    h.get('host') ??
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/^https?:\/\//, '') ??
    'localhost:3000';

  const proto =
    h.get('x-forwarded-proto') ??
    (process.env.NEXT_PUBLIC_BASE_URL?.startsWith('https://') ? 'https' : 'http');

  return `${proto}://${host}${p}`;
}
