// middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Без config.matcher — применяемся ко всем путям,
 * а внутри сами скипаем статику и служебные роуты.
 */
export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // Пропускаем статику и служебные файлы/папки
  const path = url.pathname;
  if (
    path.startsWith('/_next/') ||
    path.startsWith('/static/') ||
    path === '/favicon.ico' ||
    path === '/robots.txt' ||
    path === '/sitemap.xml' ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$/i.test(path)
  ) {
    return NextResponse.next();
  }

  // Нормализация повторных слэшей в URL
  if (path.includes('//')) {
    url.pathname = path.replace(/\/{2,}/g, '/');
    return NextResponse.redirect(url);
  }

  // (опционально) ограничим методы к /api/*
  if (path.startsWith('/api/') && !['GET','POST','PUT','PATCH','DELETE','OPTIONS'].includes(req.method)) {
    return new NextResponse('Method Not Allowed', { status: 405 });
  }

  return NextResponse.next();
}
