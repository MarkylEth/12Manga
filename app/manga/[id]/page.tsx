// app/manga/[id]/page.tsx
import { getPublicChaptersByManga } from '@/lib/data/chapters';
import MangaTitlePage from '@/components/MangaTitlePage';

type PageProps = { params: { id: string } };

// Server Component
export default async function Page({ params }: PageProps) {
  const raw = String(Array.isArray(params.id) ? params.id[0] : params.id ?? '');
  const m = raw.match(/^\d+/);                 // поддержка "62" и "62-slug"
  const mangaId = m ? Number(m[0]) : 0;

  // тянем сразу только опубликованные главы (если есть числовой id)
  const chapters = mangaId
    ? await getPublicChaptersByManga(mangaId, { order: 'desc', by: 'created_at' })
    : [];

  return <MangaTitlePage mangaId={mangaId} initialChapters={chapters} />;
}
