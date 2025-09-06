'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Loader2,
  Trash2,
  Plus,
  Eye,
  XCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { useTheme } from '@/lib/theme/context';

/* ====================== types ====================== */

type RawSubmission = {
  id: string;
  type: 'title_add' | 'title_edit';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at?: string | null;
  manga_id?: number | null;

  payload?: any;  // то, что предложил пользователь
  manga?: any;    // текущее состояние тайтла (для правок)

  author_name?: string | null;
  author_comment?: string | null;
  sources?: string[] | null;
};

type UiItem = RawSubmission & { uiType: 'new_title' | 'edit' };

/* ==================== helpers ===================== */

function toStrList(v: any): string[] {
  if (v == null) return [];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
    return v.map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(v)) {
    const arr = v
      .map((x) => (x ? x.name ?? x.genre ?? x.title ?? x.value ?? '' : ''))
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
    if (arr.length) return arr;
  }
  if (typeof v === 'object') {
    return toStrList(
      (v as any).genres ?? (v as any).genre ?? (v as any).tags ?? (v as any).tag ?? (v as any).list ?? (v as any).values ?? (v as any).names,
    );
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    try {
      return toStrList(JSON.parse(s));
    } catch {
      return s.split(/[,;|]\s*|\s{2,}|\n+/g).map((x) => x.trim()).filter(Boolean);
    }
  }
  return [String(v)].filter(Boolean);
}

function extractGenres(from: any) {
  return toStrList(
    from?.genres ??
      from?.genre ??
      from?.manga_genres ??
      from?.payload?.genres ??
      from?.payload?.genre ??
      from?.payload?.manga_genres,
  );
}

function extractTags(from: any) {
  return toStrList(from?.tags ?? from?.tag_list ?? from?.payload?.tags);
}

function formatDT(s: string) {
  return new Date(s).toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ---- Image helpers ---- */

function isValidImgSrc(src: any): src is string {
  if (typeof src !== 'string') return false;
  const s = src.trim();
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/');
}

function CoverBox({
  src,
  alt = 'cover',
  fill = false,
  width,
  height,
  className,
  sizes,
}: {
  src?: any;
  alt?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  sizes?: string;
}) {
  if (!isValidImgSrc(src)) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs opacity-60">
        Нет обложки
      </div>
    );
  }
  return fill ? (
    <Image src={src} alt={alt} fill sizes={sizes} className={className} />
  ) : (
    <Image src={src} alt={alt} width={width!} height={height!} className={className} />
  );
}

/* ===================== ui ====================== */

function Field({ label, value }: { label: string; value: unknown }) {
  const text =
    value == null
      ? '—'
      : Array.isArray(value)
      ? (value as unknown[]).length === 0
        ? '—'
        : (value as unknown[]).map(String).join(', ')
      : typeof value === 'string'
      ? value.trim() === ''
        ? '—'
        : value
      : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="min-w-[110px] font-medium">{label}:</span>
      <span className="break-words">{text}</span>
    </div>
  );
}

function TwoCols({ titleL, dataL, titleR, dataR }: any) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="mb-2 font-medium">{titleL}</div>
        <div className="space-y-1">
          <Field label="Название" value={dataL.title} />
          <Field label="Ромадзи" value={dataL.title_romaji} />
          <Field label="Автор" value={dataL.author} />
          <Field label="Художник" value={dataL.artist} />
          <Field label="Статус тайтла" value={dataL.status} />
          <Field label="Статус перевода" value={dataL.translation_status} />
          <Field label="Возраст" value={dataL.age_rating} />
          <Field label="Год" value={dataL.release_year} />
          <Field label="Тип" value={dataL.type} />
          {dataL.cover && (
            <>
              <div className="mt-2 text-sm">Обложка:</div>
              <div className="mt-1 h-40 w-32 overflow-hidden rounded-md border">
                <CoverBox src={dataL.cover} width={128} height={160} className="h-full w-full object-cover" />
              </div>
            </>
          )}
          {dataL.description && (
            <>
              <div className="mt-2 text-sm font-medium">Описание:</div>
              <div className="text-xs opacity-80 line-clamp-6">{dataL.description}</div>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 font-medium">{titleR}</div>
        <div className="space-y-1">
          <Field label="Название" value={dataR.title} />
          <Field label="Ромадзи" value={dataR.title_romaji} />
          <Field label="Автор" value={dataR.author} />
          <Field label="Художник" value={dataR.artist} />
          <Field label="Статус тайтла" value={dataR.status} />
          <Field label="Статус перевода" value={dataR.translation_status} />
          <Field label="Возраст" value={dataR.age_rating} />
          <Field label="Год" value={dataR.release_year} />
          <Field label="Тип" value={dataR.type} />
          {dataR.cover && (
            <>
              <div className="mt-2 text-sm">Обложка:</div>
              <div className="mt-1 h-40 w-32 overflow-hidden rounded-md border">
                <CoverBox src={dataR.cover} width={128} height={160} className="h-full w-full object-cover" />
              </div>
            </>
          )}
          {dataR.description && (
            <>
              <div className="mt-2 text-sm font-medium">Описание:</div>
              <div className="text-xs opacity-80 line-clamp-6">{dataR.description}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================== component ==================== */

export default function TitleSuggestionsPanel() {
  const { theme } = useTheme();
  const [items, setItems] = useState<UiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'new_title' | 'edit'>('all');
  const [selected, setSelected] = useState<UiItem | null>(null);

  const card = theme === 'light' ? 'bg-white border-gray-200' : 'bg-gray-900/40 border-white/10';
  const badge =
    theme === 'light'
      ? 'rounded-full border px-2 py-0.5 text-xs bg-gray-100 border-gray-200'
      : 'rounded-full border px-2 py-0.5 text-xs bg-slate-800/60 border-white/10';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/title-submissions', {
        cache: 'no-store',
        headers: { 'x-admin': '1' },
      });
      const txt = await res.text();
      const json = JSON.parse(txt || '{}');
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      const mapped: UiItem[] = (json.items || []).map((row: RawSubmission) => ({
        ...row,
        uiType: row.type === 'title_add' ? 'new_title' : 'edit',
      }));
      setItems(mapped);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => items.filter((x) => (filter === 'all' ? true : x.uiType === filter)),
    [items, filter],
  );

  const newTitleCount = items.filter((i) => i.uiType === 'new_title' && i.status === 'pending').length;
  const editCount = items.filter((i) => i.uiType === 'edit' && i.status === 'pending').length;

  async function act(id: string, action: 'approve' | 'reject') {
    try {
      setBusy(id);
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status: action === 'approve' ? 'approved' : 'rejected' } : x)));

      const res = await fetch('/api/admin/title-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin': '1' },
        body: JSON.stringify({ id, action }),
      });
      const txt = await res.text();
      const json = JSON.parse(txt || '{}');
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Ошибка');
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Заявки на правки и новые тайтлы</div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="rounded-lg border px-3 py-2 text-sm">
            Обновить
          </button>
          <button
            onClick={async () => {
              if (!confirm('Удалить все обработанные заявки?')) return;
              const res = await fetch('/api/admin/title-submissions?cleanup=done', {
                method: 'DELETE',
                headers: { 'x-admin': '1' },
              });
              const json = await res.json().catch(() => ({}));
              if (!res.ok || !json?.ok) return alert(json?.error || `HTTP ${res.status}`);
              setItems((prev) => prev.filter((x) => x.status === 'pending'));
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-sm text-white"
          >
            <Trash2 className="h-4 w-4" /> Очистить обработанные
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Фильтр:</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="rounded border px-3 py-1 text-sm">
            <option value="all">Все ({items.length})</option>
            <option value="new_title">Новые тайтлы ({newTitleCount})</option>
            <option value="edit">Правки ({editCount})</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm opacity-70">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}
      {error && (
        <div
          className={`rounded-xl border p-3 ${
            theme === 'light' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-red-500/10 border-red-500/30 text-red-100'
          }`}
        >
          {error}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border p-6 opacity-70">Пока заявок нет</div>
      )}

      <div className="grid gap-4">
        {filtered.map((row) => {
          const isNewTitle = row.uiType === 'new_title';
          const m = row.manga ?? {};
          const p = row.payload ?? {};

          const genres = extractGenres(p).join(', ');
          const tags = extractTags(p).join(', ');

          return (
            <div key={row.id} className={`rounded-xl border p-4 ${card}`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                      isNewTitle
                        ? 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300'
                    }`}
                  >
                    {isNewTitle ? <Plus className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {isNewTitle ? 'Новый тайтл' : 'Правка'}
                  </span>
                  <div className="text-sm">
                    <b>#{row.id}</b>
                    {!isNewTitle && (
                      <>
                        {' '}
                        • Тайтл: <b>#{row.manga_id}</b>
                      </>
                    )}{' '}
                    • автор: <b>{row.author_name || 'неизвестно'}</b>{' '}
                    <span className={badge}>{row.status}</span>
                  </div>
                </div>
                <div className="text-xs opacity-70">{formatDT(row.created_at)}</div>
              </div>

              {isNewTitle ? (
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className="relative h-48 w-36 overflow-hidden rounded-md border">
                        <CoverBox src={p.cover_url} alt="cover" fill sizes="144px" className="object-cover" />
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <h3 className="text-lg font-semibold">{p.title_ru || p.title || 'Без названия'}</h3>
                      {p.title_romaji && <p className="text-sm opacity-70">{p.title_romaji}</p>}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <Field label="Автор" value={p.author} />
                        <Field label="Художник" value={p.artist} />
                        <Field label="Статус" value={p.status} />
                        <Field label="Перевод" value={p.translation_status} />
                        <Field label="Возраст" value={p.age_rating} />
                        <Field label="Год" value={p.release_year} />
                        <Field label="Тип" value={p.type} />
                        <Field label="Жанры" value={genres} />
                        <Field label="Теги" value={tags} />
                      </div>
                      {p.description && (
                        <div className="text-sm">
                          <span className="font-medium">Описание: </span>
                          <p className="mt-1 text-xs opacity-80 line-clamp-3">{p.description}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <TwoCols
                  titleL="Текущее"
                  dataL={{
                    title: m.title ?? '—',
                    title_romaji: m.title_romaji ?? '—',
                    author: m.author ?? '—',
                    artist: m.artist ?? '—',
                    status: m.status ?? '—',
                    translation_status: m.translation_status ?? '—',
                    age_rating: m.age_rating ?? '—',
                    release_year: m.release_year ?? '—',
                    type: m.type ?? '—',
                    cover: m.cover_url ?? null,
                    description: m.description ?? '—',
                  }}
                  titleR="Предлагается"
                  dataR={{
                    title: p.title_ru ?? p.title ?? '—',
                    title_romaji: p.title_romaji ?? '—',
                    author: p.author ?? '—',
                    artist: p.artist ?? '—',
                    status: p.status ?? '—',
                    translation_status: p.translation_status ?? '—',
                    age_rating: p.age_rating ?? '—',
                    release_year: p.release_year ?? '—',
                    type: p.type ?? '—',
                    cover: p.cover_url ?? null,
                    description: p.description ?? '—',
                  }}
                />
              )}

              <div className="mt-3 flex items-center gap-2">
                {row.status === 'pending' && (
                  <>
                    <button
                      disabled={busy === row.id}
                      onClick={() => act(row.id, 'approve')}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      {busy === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Одобрить
                    </button>
                    <button
                      disabled={busy === row.id}
                      onClick={() => act(row.id, 'reject')}
                      className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      {busy === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Отклонить
                    </button>
                  </>
                )}

                <button
                  onClick={() => setSelected(row)}
                  className="rounded-md border px-3 py-1.5 text-sm"
                >
                  Подробнее
                </button>

                {row.manga_id ? (
                  <a
                    href={`/manga/${row.manga_id}`}
                    target="_blank"
                    className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm ${
                      theme === 'light' ? 'bg-blue-600 text-white' : 'bg-blue-500 text-black'
                    }`}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Открыть
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className={`relative z-10 w-full max-w-4xl max-h-[90vh] overflow-auto rounded-2xl border p-6 ${card}`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xl font-semibold">
                  {selected.uiType === 'new_title'
                    ? selected.payload?.title_ru || selected.payload?.title || 'Без названия'
                    : selected.manga?.title || 'Правка'}
                </div>
                <div className="text-xs opacity-70 mt-1">Создано: {formatDT(selected.created_at)}</div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className={`rounded-lg p-2 ${theme === 'light' ? 'hover:bg-gray-100' : 'hover:bg-gray-800'}`}
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {selected.uiType === 'new_title' ? (
              <>
                <div className="grid gap-6 md:grid-cols-[180px_1fr]">
                  <div className="relative h-[260px] w-[180px] overflow-hidden rounded-md border">
                    <CoverBox src={selected.payload?.cover_url} alt="cover" fill sizes="180px" className="object-cover" />
                  </div>
                  <div className="space-y-2">
                    <Field label="Автор" value={selected.payload?.author} />
                    <Field label="Художник" value={selected.payload?.artist} />
                    <Field label="Статус" value={selected.payload?.status} />
                    <Field label="Перевод" value={selected.payload?.translation_status} />
                    <Field label="Возраст" value={selected.payload?.age_rating} />
                    <Field label="Год" value={selected.payload?.release_year} />
                    <Field label="Тип" value={selected.payload?.type} />
                    <Field label="Жанры" value={extractGenres(selected).join(', ')} />
                    <Field label="Теги" value={extractTags(selected).join(', ')} />
                    {selected.payload?.description && (
                      <div className="pt-2">
                        <div className="text-sm font-medium">Описание</div>
                        <div className="text-sm opacity-80 whitespace-pre-wrap">
                          {selected.payload.description}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-1">
                  <Field label="Автор заявки" value={selected.author_name || '—'} />
                  <Field label="Комментарий" value={selected.author_comment || '—'} />
                  <div>
                    <div className="text-sm font-medium">Ссылки на оригинал</div>
                    {Array.isArray(selected.sources) && selected.sources.length ? (
                      <div className="space-y-1 mt-1">
                        {selected.sources.map((u, i) => (
                          <a key={`${u}-${i}`} href={u} target="_blank" className="text-sm underline break-all">
                            {u}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm opacity-70">Пусто</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <TwoCols
                titleL="Текущее"
                dataL={{
                  title: selected.manga?.title ?? '—',
                  title_romaji: selected.manga?.title_romaji ?? '—',
                  author: selected.manga?.author ?? '—',
                  artist: selected.manga?.artist ?? '—',
                  status: selected.manga?.status ?? '—',
                  translation_status: selected.manga?.translation_status ?? '—',
                  age_rating: selected.manga?.age_rating ?? '—',
                  release_year: selected.manga?.release_year ?? '—',
                  type: selected.manga?.type ?? '—',
                  cover: selected.manga?.cover_url ?? null,
                  description: selected.manga?.description ?? '—',
                }}
                titleR="Предлагается"
                dataR={{
                  title: selected.payload?.title_ru ?? selected.payload?.title ?? '—',
                  title_romaji: selected.payload?.title_romaji ?? '—',
                  author: selected.payload?.author ?? '—',
                  artist: selected.payload?.artist ?? '—',
                  status: selected.payload?.status ?? '—',
                  translation_status: selected.payload?.translation_status ?? '—',
                  age_rating: selected.payload?.age_rating ?? '—',
                  release_year: selected.payload?.release_year ?? '—',
                  type: selected.payload?.type ?? '—',
                  cover: selected.payload?.cover_url ?? null,
                  description: selected.payload?.description ?? '—',
                }}
              />
            )}

            <div className="mt-5 flex items-center gap-2">
              {selected.status === 'pending' && (
                <>
                  <button
                    onClick={() => act(selected.id, 'approve')}
                    className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Одобрить
                  </button>
                  <button
                    onClick={() => act(selected.id, 'reject')}
                    className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm text-white"
                  >
                    <XCircle className="h-4 w-4" /> Отклонить
                  </button>
                </>
              )}
              <button onClick={() => setSelected(null)} className="rounded-md border px-4 py-2 text-sm">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
