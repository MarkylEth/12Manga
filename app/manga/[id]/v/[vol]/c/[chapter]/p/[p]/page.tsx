import ChapterReader from '@/components/ChapterReader';

type Params = {
  id: string;       // может быть "6-yakutia"
  vol: string;      // номер тома
  chapter: string;  // номер главы
  p: string;        // страница
};

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Params }) {
  // из "6-yakutia" достаём 6, иначе оставляем как есть
  const mangaId = params.id.match(/\d+/)?.[0] ?? params.id;

  return (
    <ChapterReader
      mangaId={mangaId}
      vol={params.vol ?? 'none'}
      chapter={params.chapter}
      page={params.p ?? '1'}
    />
  );
}
