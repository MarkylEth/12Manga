// app/api/ydebug/route.ts
import { NextResponse } from 'next/server';

// Похоже на /netdebug, но оставим отдельный роут для «локальной» отладки
export async function GET(req: Request) {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  // @ts-ignore
  for (const [k, v] of req.headers || []) headers[k] = v;

  return NextResponse.json({
    ok: true,
    method: 'GET',
    href: url.href,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    headers,
    ts: new Date().toISOString(),
  });
}
