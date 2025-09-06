// app/api/views/[slug]/route.ts
import { NextResponse } from 'next/server';

// GET: вернуть счётчик просмотров (заглушка)
export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const { slug } = params;
  // TODO: SELECT count FROM views WHERE slug=$1
  return NextResponse.json({ ok: true, slug, count: null });
}

// POST: инкремент счётчика (заглушка)
export async function POST(_: Request, { params }: { params: { slug: string } }) {
  const { slug } = params;
  // TODO: INSERT ON CONFLICT UPDATE
  return NextResponse.json({ ok: true, slug, incremented: true });
}
