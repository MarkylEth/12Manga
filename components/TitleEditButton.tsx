// components/TitleEditButton.tsx
'use client';

import React, { useState } from 'react';
import { Pencil, Loader2, X } from 'lucide-react';

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
};

export default function TitleEditButton({ mangaId, defaults }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState<any>({
    title: defaults?.title || '',
    title_romaji: defaults?.title_romaji || '',
    author: defaults?.author || '',
    artist: defaults?.artist || '',
    status: defaults?.status || '',
    translation_status: defaults?.translation_status || '',
    age_rating: defaults?.age_rating || '',
    release_year: defaults?.release_year || '',
    type: defaults?.type || '',
    cover_url: defaults?.cover_url || '',
    description: defaults?.description || '',
    genres: (defaults?.genres || []).join(', '),
    tags: (defaults?.tags || []).join(', '),
    sources: '',
    author_comment: '',
  });

  async function submit() {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const payload = {
        title: form.title?.trim() || undefined,
        title_romaji: form.title_romaji?.trim() || undefined,
        author: form.author?.trim() || undefined,
        artist: form.artist?.trim() || undefined,
        status: form.status?.trim() || undefined,
        translation_status: form.translation_status?.trim() || undefined,
        age_rating: form.age_rating?.trim() || undefined,
        release_year: form.release_year ? Number(form.release_year) : undefined,
        type: form.type?.trim() || undefined,
        cover_url: form.cover_url?.trim() || undefined,
        description: form.description?.trim() || undefined,
        genres: form.genres,
        tags: form.tags,
      };

      const res = await fetch('/api/title-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'title_edit',
          manga_id: mangaId,
          payload,
          author_comment: form.author_comment?.trim() || undefined,
          sources: form.sources,
        }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setOk('Спасибо! Ваша правка отправлена на модерацию.');
      setTimeout(() => setOpen(false), 1200);
    } catch (e: any) {
      setErr(e?.message || 'Ошибка отправки');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-white/5"
      >
        <Pencil className="h-4 w-4" />
        Предложить правку
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl border bg-slate-900 p-4 text-white">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Предложить правку тайтла</div>
              <button className="rounded p-1 hover:bg-white/10" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">Название
                <input className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.title} onChange={e=>setForm({...form, title:e.target.value})}/>
              </label>
              <label className="text-sm">Ромадзи
                <input className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.title_romaji} onChange={e=>setForm({...form, title_romaji:e.target.value})}/>
              </label>

              <label className="text-sm">Автор
                <input className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.author} onChange={e=>setForm({...form, author:e.target.value})}/>
              </label>
              <label className="text-sm">Художник
                <input className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.artist} onChange={e=>setForm({...form, artist:e.target.value})}/>
              </label>

              <label className="text-sm">Статус тайтла
                <input className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.status} onChange={e=>setForm({...form, status:e.target.value})}/>
              </label>
              <label className="text-sm">Статус перевода
                <input className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.translation_status} onChange={e=>setForm({...form, translation_status:e.target.value})}/>
              </label>

              <label className="text-sm">Возрастной рейтинг
                <input className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.age_rating} onChange={e=>setForm({...form, age_rating:e.target.value})}/>
              </label>
              <label className="text-sm">Год
                <input type="number" className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.release_year} onChange={e=>setForm({...form, release_year:e.target.value})}/>
              </label>

              <label className="text-sm">Тип
                <input className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.type} onChange={e=>setForm({...form, type:e.target.value})}/>
              </label>
              <label className="text-sm">Обложка (URL)
                <input className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.cover_url} onChange={e=>setForm({...form, cover_url:e.target.value})}/>
              </label>

              <label className="text-sm md:col-span-2">Описание
                <textarea className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm min-h-[90px]"
                          value={form.description} onChange={e=>setForm({...form, description:e.target.value})}/>
              </label>

              <label className="text-sm md:col-span-2">Жанры (через запятую)
                <input className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.genres} onChange={e=>setForm({...form, genres:e.target.value})}/>
              </label>
              <label className="text-sm md:col-span-2">Теги (через запятую)
                <input className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
                       value={form.tags} onChange={e=>setForm({...form, tags:e.target.value})}/>
              </label>

              <label className="text-sm md:col-span-2">Ссылки-источники (через запятую или с новой строки)
                <textarea className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm min-h-[70px]"
                          value={form.sources} onChange={e=>setForm({...form, sources:e.target.value})}/>
              </label>
              <label className="text-sm md:col-span-2">Комментарий к заявке
                <textarea className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm min-h-[70px]"
                          value={form.author_comment} onChange={e=>setForm({...form, author_comment:e.target.value})}/>
              </label>
            </div>

            {err && <div className="mt-3 text-sm text-rose-300">{err}</div>}
            {ok && <div className="mt-3 text-sm text-emerald-300">{ok}</div>}

            <div className="mt-4 flex items-center gap-2">
              <button disabled={busy}
                      onClick={submit}
                      className="inline-flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Отправить на модерацию
              </button>
              <button onClick={()=>setOpen(false)} className="rounded border px-4 py-2 text-sm">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
