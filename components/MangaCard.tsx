'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Star, BookOpen, Clock } from 'lucide-react';

export type MangaCardItem = {
  id: string | number;
  title: string;
  coverUrl?: string | null;
  titleStatus?: 'Онгоинг' | 'Завершён' | 'Пауза';
  rating10?: number; // 0–10
  chapters?: number;
  dateAdded?: string | Date;
  genres?: string[];
};

export function MangaCard({
  item,
  mode = 'light',
  hrefBase = '/manga',
}: {
  item: MangaCardItem;
  mode?: 'light' | 'dark';
  hrefBase?: string;
}) {
  const textMain = mode === 'light' ? 'text-gray-900' : 'text-white';
  const textMuted = mode === 'light' ? 'text-gray-600' : 'text-slate-400';
  const cardBox = mode === 'light' ? 'bg-white border border-gray-200' : 'bg-slate-800/60 border border-slate-700';

  const statusCls =
    item.titleStatus === 'Онгоинг'
      ? 'bg-green-500 text-white'
      : item.titleStatus === 'Завершён'
      ? 'bg-blue-500 text-white'
      : 'bg-orange-500 text-white';

  return (
    <div className={`${cardBox} rounded-xl overflow-hidden hover:border-blue-500/50 transition-all duration-300 group`}>
      <div className="aspect-[3/4] relative overflow-hidden">
        <Image src={item.coverUrl || '/placeholder.png'} alt={item.title} fill className="object-cover group-hover:scale-110 transition-transform duration-500" />
        {item.titleStatus && (
          <div className="absolute top-2 left-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusCls}`}>{item.titleStatus}</span>
          </div>
        )}
        {typeof item.rating10 === 'number' && (
          <div className="absolute top-2 right-2">
            <div className="flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              <span className="text-xs text-white font-medium">{item.rating10.toFixed(1)}</span>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      <div className="p-4">
        <h3 className={`font-semibold line-clamp-2 mb-2 ${textMain}`}>{item.title}</h3>

        <div className={`flex items-center gap-4 text-xs ${textMuted} mb-3`}>
          {typeof item.chapters === 'number' && (
            <div className="flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              <span>{item.chapters} глав</span>
            </div>
          )}
          {item.dateAdded && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{new Date(item.dateAdded).toLocaleDateString('ru-RU')}</span>
            </div>
          )}
        </div>

        {item.genres && item.genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {item.genres.slice(0, 3).map((g, i) => (
              <span key={i} className={`px-2 py-1 rounded text-xs ${mode === 'light' ? 'bg-gray-100 text-gray-700' : 'bg-slate-700 text-slate-300'}`}>
                {g}
              </span>
            ))}
            {item.genres.length > 3 && <span className={`px-2 py-1 rounded text-xs ${textMuted}`}>+{item.genres.length - 3}</span>}
          </div>
        )}

        <Link href={`${hrefBase}/${item.id}`}>
          <button className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Читать</button>
        </Link>
      </div>
    </div>
  );
}

export function MangaGrid({
  items,
  mode = 'light',
  hrefBase = '/manga',
}: {
  items: MangaCardItem[];
  mode?: 'light' | 'dark';
  hrefBase?: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
      {items.map((it) => (
        <MangaCard key={it.id} item={it} mode={mode} hrefBase={hrefBase} />
      ))}
    </div>
  );
}

export default MangaCard;
