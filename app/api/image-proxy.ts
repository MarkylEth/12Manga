import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');
    
    if (!imageUrl) {
      return new NextResponse('URL parameter is required', { status: 400 });
    }

    // Проверяем, что это наш домен
    if (!imageUrl.includes('xim.ru') && !imageUrl.includes('wasabisys.com')) {
      return new NextResponse('Unauthorized domain', { status: 403 });
    }

    // Добавляем заголовки авторизации для Wasabi (если нужны)
    const headers: HeadersInit = {
      // Если нужны ключи API для Wasabi, добавь их сюда:
      // 'Authorization': `Bearer ${process.env.WASABI_ACCESS_TOKEN}`,
      // или другие нужные заголовки для аутентификации
      'User-Agent': 'Mozilla/5.0 (compatible; NextJS Image Proxy)',
    };

    const response = await fetch(imageUrl, {
      headers,
    });

    if (!response.ok) {
      console.error('Failed to fetch image:', response.status, response.statusText);
      // Возвращаем пустую картинку в случае ошибки
      return new NextResponse(null, { status: 404 });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600', // кеш на 1 час
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      },
    });

  } catch (error) {
    console.error('Image proxy error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}