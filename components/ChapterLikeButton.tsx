'use client';

import React from 'react';
import { Heart } from 'lucide-react';
import { useTheme } from '@/lib/theme/context';

type Props = { chapterId: number; className?: string };

/**
 * Лайки переведены в read-only до включения кастомной авторизации.
 * Берём счётчик по REST, клик показывает подсказку.
 */
export default function ChapterLikeButton({ chapterId, className = '' }: Props) {
  const { theme } = useTheme();
  const [likes, setLikes] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/chapters/${chapterId}`, { cache: 'no-store' });
        const js = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(js?.error || `HTTP ${res.status}`);
        if (!cancelled) setLikes(Number(js?.item?.likes_count ?? 0));
      } catch {
        if (!cancelled) setLikes(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [chapterId]);

  const base =
    theme === 'light'
      ? 'text-black border-black/20 bg-white hover:bg-black/5'
      : 'text-white border-white/30 bg-transparent hover:bg-white/10';

  const onClick = () => {
    alert('Лайки временно отключены — авторизация будет заменена на кастомную систему.');
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 transition ${base}`}
        title="Лайки временно отключены"
      >
        <Heart className="w-4 h-4" />
        <span className="font-semibold">{loading ? '…' : likes ?? 0}</span>
        <span className="text-sm opacity-70">лайков</span>
      </button>
    </div>
  );
}
