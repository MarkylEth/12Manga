// пример: серверная обёртка, которая рендерит клиентский <ChapterReader />
import ChapterReader from '@/components/ChapterReader';
import { abs } from '@/lib/abs';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: { id: string; vol: string; chapter: string; page?: string };
}) {
  // пример проверки существования главы на сервере:
  const res = await fetch(
    abs(`/api/reader/${params.id}/volume/${params.vol}/chapter/${params.chapter}`),
    { cache: 'no-store' }
  );
  if (!res.ok) {
    // notFound() или редирект
  }

  // сам ридер — клиентский компонент (fetch внутри него относительный, это ок)
  return (
    <ChapterReader
      mangaId={params.id}
      vol={params.vol}
      chapter={params.chapter}
      page={params.page ?? '1'}
    />
  );
}
