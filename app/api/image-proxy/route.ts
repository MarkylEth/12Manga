// app/api/image-proxy/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const u = searchParams.get('u');
  if (!u) return new Response('missing u', { status: 400 });

  try {
    const upstream = await fetch(u, {
      // максимально «обычный» UA и без реферера
      headers: { 'user-agent': 'Mozilla/5.0', 'referer': '' },
      redirect: 'follow',
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return new Response(`upstream ${upstream.status}`, { status: 502 });
    }

    const buf = await upstream.arrayBuffer();
    const type = upstream.headers.get('content-type') ?? 'image/jpeg';

    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': type,
        'cache-control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    return new Response('proxy error', { status: 502 });
  }
}
