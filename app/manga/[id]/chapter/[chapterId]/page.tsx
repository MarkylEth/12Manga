import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function originFromHeaders() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  if (host) return `${proto}://${host}`;
  const env = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  return env || 'http://localhost:3000';
}

export default async function Page({
  params,
}: { params: { id: string; chapterId: string } }) {
  const base = await originFromHeaders();
  const r = await fetch(`${base}/api/chapters/${encodeURIComponent(params.chapterId)}`, { cache: 'no-store' });
  if (!r.ok) notFound();
  const j = await r.json().catch(() => null);
  const item = j?.item;
  if (!item) notFound();

  const vol = item.volume_index ?? item.vol ?? null;
  const ch  = item.chapter_number ?? item.chapter ?? null;

  if (vol != null && ch != null) {
    redirect(`/manga/${params.id}/v/${Number(vol)}/c/${String(ch)}/p/1`);
  }
  notFound();
}
