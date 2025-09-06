'use client';

import React, { useState } from 'react';
import { Pencil, Loader2, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/context';

type Props = {
  mangaId: number;
  defaults?: Partial<{
    title: string;
    title_romaji: string;
    author: string;
    artist: string;
    status: string;
    translation_status: string;
    age_rating: string;
    release_year: number;
    type: string;
    cover_url: string;
    description: string;
    genres: string[];
    tags: string[];
  }>;
  me?: { id: string; username?: string | null } | null;
};

const toCSV = (v: string[] | string | undefined) =>
  Array.isArray(v) ? v.join(', ') : (v ?? '');

export default function SuggestEditButton({ mangaId, defaults, me }: Props) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: defaults?.title ?? '',
    title_romaji: defaults?.title_romaji ?? '',
    author: defaults?.author ?? '',
    artist: defaults?.artist ?? '',
    status: defaults?.status ?? '',
    translation_status: defaults?.translation_status ?? '',
    age_rating: defaults?.age_rating ?? '',
    release_year: (defaults?.release_year ?? '') as number | '' | string,
    type: defaults?.type ?? '',
    cover_url: defaults?.cover_url ?? '',
    description: defaults?.description ?? '',
    genres: toCSV(defaults?.genres),
    tags: toCSV(defaults?.tags),
    sources: '',
    author_comment: '',
  });

  const btnNeutral =
    theme === 'light'
      ? 'inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-900 px-3 py-1.5 text-sm'
      : 'inline-flex items-center gap-2 rounded-md border border-white/10 bg-gray-800/60 hover:bg-gray-700 text-white px-3 py-1.5 text-sm';

  const card =
    theme === 'light'
      ? 'bg-white text-gray-900 border border-gray-200'
      : 'bg-slate-900 text-white border border-white/10';

  const input =
    theme === 'light'
      ? 'mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm'
      : 'mt-1 w-full rounded border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white';

  const textArea =
    theme === 'light'
      ? 'mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm min-h-[88px]'
      : 'mt-1 w-full rounded border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white min-h-[88px]';

  const submitBtn =
    theme === 'light'
      ? 'inline-flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50'
      : 'inline-flex items-center gap-2 rounded bg-emerald-500 px-4 py-2 text-sm text-black disabled:opacity-50';

  async function submit() {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const res = await fetch('/api/title-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'title_edit',
          manga_id: mangaId,
          author_name: me?.username ?? undefined,
          user_id: me?.id ?? undefined,
          author_comment: form.author_comment || undefined,
          source_links: form.sources, // строка — ваш API сам распарсит в массив
          payload: {
            title: form.title || undefined,
            title_romaji: form.title_romaji || undefined,
            author: form.author || undefined,
            artist: form.artist || undefined,
            status: form.status || undefined,
            translation_status: form.translation_status || undefined,
            age_rating: form.age_rating || undefined,
            release_year:
              form.release_year === '' ? undefined : Number(form.release_year),
            type: form.type || undefined,
            cover_url: form.cover_url || undefined,
            description: form.description || undefined,
            genres: form.genres, // CSV/многострочно — ваш бэкенд понимает
            tags: form.tags,
          },
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setOk('Правка отправлена на модерацию ✅');
      setTimeout(() => setOpen(false), 1200);
    } catch (e: any) {
      setErr(e?.message || 'Не удалось отправить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className={btnNeutral} onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Предложить правку
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div
            className={`relative z-10 w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl p-4 ${card}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold">Предложить правку тайтла</div>
              <button
                className="rounded p-1 hover:bg-white/10"
                onClick={() => setOpen(false)}
                title="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  ['Название', 'title'],
                  ['Ромадзи', 'title_romaji'],
                  ['Автор', 'author'],
                  ['Художник', 'artist'],
                  ['Статус', 'status'],
                  ['Статус перевода', 'translation_status'],
                  ['Возраст', 'age_rating'],
                  ['Год', 'release_year'],
                  ['Тип', 'type'],
                  ['Обложка (URL)', 'cover_url'],
                ] as const
              ).map(([label, key]) => (
                <label key={key} className="text-sm">
                  {label}
                  <input
                    className={input}
                    value={(form as any)[key] as any}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}

              <label className="text-sm md:col-span-2">
                Описание
                <textarea
                  className={textArea}
                  value={form.description}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, description: e.target.value }))
                  }
                />
              </label>

              <label className="text-sm md:col-span-2">
                Жанры (через запятую/строки)
                <input
                  className={input}
                  value={form.genres}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, genres: e.target.value }))
                  }
                />
              </label>

              <label className="text-sm md:col-span-2">
                Теги (через запятую/строки)
                <input
                  className={input}
                  value={form.tags}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, tags: e.target.value }))
                  }
                />
              </label>

              <label className="text-sm md:col-span-2">
                Ссылки-источники (по строкам/через запятую)
                <textarea
                  className={textArea}
                  value={form.sources}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, sources: e.target.value }))
                  }
                />
              </label>

              <label className="text-sm md:col-span-2">
                Комментарий к правке
                <textarea
                  className={textArea}
                  value={form.author_comment}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, author_comment: e.target.value }))
                  }
                />
              </label>
            </div>

            {err && <div className="mt-3 text-sm text-rose-500">{err}</div>}
            {ok && <div className="mt-3 text-sm text-emerald-500">{ok}</div>}

            <div className="mt-4 flex items-center gap-2">
              <button
                disabled={busy}
                onClick={submit}
                className={submitBtn}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Отправить на модерацию
              </button>
              <button
                onClick={() => setOpen(false)}
                className={
                  theme === 'light'
                    ? 'rounded border border-gray-300 px-4 py-2 text-sm'
                    : 'rounded border border-white/10 px-4 py-2 text-sm'
                }
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
