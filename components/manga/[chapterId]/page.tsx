'use client';

import { useEffect, useState } from 'react';

type ChapterPage = {
  chapter_id: number;
  page_index: number;
  image_url: string;
  width?: number | null;
  height?: number | null;
};

export default function ChapterReader({ chapterId }: { chapterId: number }) {
  const [pages, setPages] = useState<ChapterPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Переведено на REST: серверный роут ходит в Neon и возвращает страницы по главе.
        const res = await fetch(`/api/chapters/${chapterId}/pages`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }
        if (!cancelled) setPages((json?.items ?? []) as ChapterPage[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Не удалось загрузить страницы');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <div className="text-sm opacity-70">Загрузка страниц…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-4 text-center">
        <div className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-rose-200">
          Ошибка: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {pages.map((p) => (
        <img
          key={p.page_index}
          src={p.image_url}
          alt={`Page ${p.page_index}`}
          className="w-full max-w-3xl select-none"
          draggable={false}
          loading="lazy"
        />
      ))}
      {pages.length === 0 && (
        <div className="py-10 text-sm opacity-70">Страницы не найдены</div>
      )}
    </div>
  );
}
