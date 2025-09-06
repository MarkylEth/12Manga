'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme/context';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  CornerDownRight,
  X,
  Heart,
  Trash2,
  Pencil,
  Pin,
  PinOff,
} from 'lucide-react';

/* =================== Types =================== */
type Page = {
  id: number;
  chapter_id: number;
  index: number;          // page_index | page_number | row_number
  url: string;            // image_url/url/path
  width?: number | null;
  height?: number | null;
  volume_index?: number | null; // том страницы (если есть в API)
};

type ChapterMeta = {
  id?: number | string | null;
  manga_id?: number | string | null;
  chapter_number?: number | string | null;
  vol?: number | string | null;
  title?: string | null;
};

type Props =
  | {
      chapterId: number | string;
      mangaId?: never;
      vol?: never;
      chapter?: never;
      page?: never;
    }
  | {
      chapterId?: never;
      mangaId: number | string;
      vol: number | string | 'none';
      chapter: number | string;
      page?: number | string; // стартовая страница из урла (/p/N)
    };

type PageComment = {
  id: string;
  page_id: number;
  chapter_id: number;
  user_id: string | null;
  created_at: string;
  content: string;
  parent_id?: string | null;
  is_team_comment?: boolean | null;
  team_id?: number | null;
  is_pinned?: boolean | null;
  likes_count?: number | null;
  is_edited?: boolean | null;
  edited_at?: string | null;
};

type Profile = { username?: string | null; avatar_url?: string | null };
type Team = { name?: string | null; avatar_url?: string | null };
type SortMode = 'new' | 'old' | 'top';

/* =================== Helpers =================== */
function sanitize(input: string) {
  let html = (input || '').replace(/&nbsp;/gi, ' ');
  html = html.replace(/<strike\b[^>]*>/gi, '<s>').replace(/<\/strike>/gi, '</s>');
  const allow = ['b', 'i', 'u', 's', 'del', 'strong', 'em', 'br'].join('|');
  html = html.replace(new RegExp(String.raw`<(?!\/?(?:${allow})\b)[^>]*>`, 'gi'), '');
  html = html.replace(new RegExp(String.raw`<(?:${allow})>\s*<\/(?:${allow})>`, 'gi'), '');
  html = html.replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>');
  return html.trim();
}

/* =================== Component =================== */
export default function ChapterReader(props: Props) {
  const { theme } = useTheme();
  const pathname = usePathname();

  const byId = 'chapterId' in props && props.chapterId !== undefined;
  const chapterId = byId ? String((props as any).chapterId) : null;
  const mangaId = !byId ? String((props as any).mangaId) : null;
  const vol = !byId ? String((props as any).vol) : null;
  const chapter = !byId ? String((props as any).chapter) : null;
  const pageParam = !byId ? String((props as any).page ?? '1') : '1';

  const pagesUrl = useMemo(() => {
    if (byId && chapterId)
      return `/api/reader/chapter/${encodeURIComponent(chapterId)}/pages`;
    if (!byId && mangaId && vol != null && chapter != null)
      return `/api/reader/${encodeURIComponent(
        mangaId
      )}/volume/${encodeURIComponent(vol)}/chapter/${encodeURIComponent(
        chapter
      )}/pages`;
    return '';
  }, [byId, chapterId, mangaId, vol, chapter]);

  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ChapterMeta>({});
  const [nextHref, setNextHref] = useState<string | null>(null);

  // текущая страница (индекс)
  const [index, setIndex] = useState(0);

  // стартовый индекс из /p/N
  useEffect(() => {
    const n = Math.max(1, Number(pageParam || 1)) - 1;
    setIndex(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageParam]);

  // auth (минимальная): userId берём из /api/auth/me
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { userId: null }))
      .then((j) => setUserId(j?.userId ?? null))
      .catch(() => setUserId(null));
  }, []);

  /* ===== Загрузка страниц ===== */
  useEffect(() => {
    if (!pagesUrl) return;
    let cancel = false;
    setLoading(true);
    setError(null);

    fetch(pagesUrl, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((j) => {
        if (cancel) return;
        const arr: Page[] = (Array.isArray(j?.pages)
          ? j.pages
          : Array.isArray(j?.items)
          ? j.items
          : []
        )
          .map((p: any) => ({
            id: Number(p.id),
            chapter_id: Number(p.chapter_id),
            index: Number(p.index ?? p.page_index ?? p.page_number ?? 0),
            url: String(p.url ?? p.image_url ?? ''),
            width: p.width ?? null,
            height: p.height ?? null,
            volume_index:
              p.volume_index == null ? null : Number(p.volume_index),
          }))
          .sort((a: Page, b: Page) => a.index - b.index || a.id - b.id);

        // если стартовая /p/N выходит за пределы — скорректируем
        const start = Math.min(
          Math.max(0, Math.max(1, Number(pageParam || 1)) - 1),
          Math.max(0, arr.length - 1)
        );

        setPages(arr);
        setIndex(start);
      })
      .catch((e: any) => !cancel && setError(e.message || 'Ошибка загрузки'))
      .finally(() => !cancel && setLoading(false));

    return () => {
      cancel = true;
    };
  }, [pagesUrl, pageParam]);

  /* ===== Быстрое обновление сегмента /p/N (без навигации Next.js) ===== */
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!pathname) return;

    if (!didMountRef.current) {
      didMountRef.current = true; // пропускаем первый рендер
      return;
    }

    const base = pathname.replace(/\/p\/\d+\/?$/i, '');
    const next = `${base}/p/${Math.max(1, index + 1)}`;

    if (next !== window.location.pathname) {
      window.history.replaceState(null, '', next); // тихо меняем URL
    }
  }, [index, pathname]);

  /* ===== Прелоад соседних изображений для мгновенного листания ===== */
  useEffect(() => {
    const nextUrl = pages[index + 1]?.url;
    const prevUrl = pages[index - 1]?.url;
    [nextUrl, prevUrl].filter(Boolean).forEach((src) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src as string;
    });
  }, [index, pages]);

  /* ===== Мета + «следующая глава» ===== */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (byId && chapterId) {
          // мета по id
          const r = await fetch(`/api/chapters/${chapterId}`, {
            cache: 'no-store',
          });
          const j = await r.json().catch(() => ({}));
          const ch: ChapterMeta = j?.item ?? {};
          if (!cancel) setMeta(ch);

          if (ch?.manga_id != null && ch?.chapter_number != null) {
            const n = await fetch(
              `/api/manga/${ch.manga_id}/chapters/next?after=${encodeURIComponent(
                String(ch.chapter_number)
              )}`,
              { cache: 'no-store' }
            );
            const nj = await n.json().catch(() => ({}));
            if (!cancel && nj?.item?.id)
              setNextHref(`/manga/${ch.manga_id}/chapter/${nj.item.id}`);
          }
          return;
        }

        // meta по slug-пути
        if (!byId && mangaId && vol != null && chapter != null) {
          if (!cancel) setMeta({ manga_id: mangaId, vol, chapter_number: chapter });

          const r = await fetch(
            `/api/reader/${mangaId}/volume/${vol}/chapters`,
            { cache: 'no-store' }
          );
          const j = await r.json().catch(() => ({}));
          const list: { chapter: string }[] = Array.isArray(j?.items)
            ? j.items
            : [];

          const current = String(chapter);
          const idx = list.findIndex((x) => String(x.chapter) === current);
          if (!cancel) {
            if (idx >= 0 && idx + 1 < list.length) {
              const next = String(list[idx + 1].chapter);
              setNextHref(`/manga/${mangaId}/v/${vol}/c/${next}/p/1`);
            } else setNextHref(null);
          }
        }
      } catch {}
    })();
    return () => {
      cancel = true;
    };
  }, [byId, chapterId, mangaId, vol, chapter]);

  /* ===== Комментарии / лайки (через Neon API) ===== */
  const [pageComments, setPageComments] = useState<PageComment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [teams, setTeams] = useState<Record<number, Team>>({});
  const [likedByMe, setLikedByMe] = useState<Record<string, boolean>>({});
  const [likesCount, setLikesCount] = useState<Record<string, number>>({});

  const loadPageComments = useCallback(
    async (page: Page, signal?: AbortSignal) => {
      const url = `/api/reader/pages/${page.id}/comments${
        userId ? `?user=${encodeURIComponent(userId)}` : ''
      }`;
      const r = await fetch(url, { cache: 'no-store', signal });
      const j = await r.json().catch(() => ({}));

      const comments: PageComment[] = j?.items ?? [];
      setPageComments(comments);

      setProfiles(j?.users ?? {});
      setTeams(j?.teams ?? {});

      const likes: Record<string, number> = {};
      comments.forEach((c) => {
        likes[c.id] = c.likes_count ?? 0;
      });
      setLikesCount(likes);
      setLikedByMe(j?.likedByMe ?? {});
    },
    [userId]
  );

  useEffect(() => {
    const p = pages[index];
    if (!p) {
      setPageComments([]);
      return;
    }
    const ctrl = new AbortController();
    loadPageComments(p, ctrl.signal).catch(() => {});
    return () => ctrl.abort();
  }, [pages, index, loadPageComments]);

  /* ===== Отправка комментария ===== */
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string } | null>(null);
  const [asTeam, setAsTeam] = useState(false);
  const [pinOnSend, setPinOnSend] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const sendComment = async () => {
    if (!userId) return alert('Войдите, чтобы комментировать');
    const page = pages[index];
    if (!page) return;

    const html = sanitize(editorRef.current?.innerHTML ?? '');
    const plain =
      editorRef.current?.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
    if (!plain) return;

    setSending(true);
    try {
      const r = await fetch(`/api/reader/pages/${page.id}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          content: html,
          parent_id: replyTo?.id ?? null,
          as_team: asTeam,
          pin: pinOnSend,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'Не удалось отправить');

      if (editorRef.current) editorRef.current.innerHTML = '';
      setIsEmpty(true);
      setReplyTo(null);
      setAsTeam(false);
      setPinOnSend(false);
      // перезагрузим комментарии
      await loadPageComments(page);
    } catch (e: any) {
      alert(e?.message ?? 'Ошибка отправки');
    } finally {
      setSending(false);
    }
  };

  /* ===== like/unlike ===== */
  async function toggleLike(id: string) {
    if (!userId) return alert('Войдите');
    const liked = !!likedByMe[id];
    const url = `/api/reader/comments/${encodeURIComponent(id)}/like`;
    try {
      if (liked) {
        await fetch(url, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
        });
        setLikedByMe((m) => ({ ...m, [id]: false }));
        setLikesCount((m) => ({ ...m, [id]: Math.max(0, (m[id] ?? 1) - 1) }));
      } else {
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
        });
        setLikedByMe((m) => ({ ...m, [id]: true }));
        setLikesCount((m) => ({ ...m, [id]: (m[id] ?? 0) + 1 }));
      }
    } catch (e: any) {
      alert(e?.message ?? 'Не удалось изменить лайк');
    }
  }

  /* ===== edit/delete ===== */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editRef = useRef<HTMLDivElement | null>(null);

  function startEdit(id: string, html: string) {
    setEditingId(id);
    setTimeout(() => {
      if (editRef.current) editRef.current.innerHTML = html;
    }, 0);
  }
  async function saveEdit(id: string) {
    if (!userId) return;
    const html = sanitize(editRef.current?.innerHTML ?? '');
    if (!html) return;
    const r = await fetch(`/api/reader/comments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: userId, content: html }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) return alert(j?.error || 'Не удалось сохранить');
    setPageComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, content: html, is_edited: true } : c))
    );
    setEditingId(null);
  }
  async function deleteComment(id: string) {
    if (!userId) return;
    if (!confirm('Удалить комментарий?')) return;
    const r = await fetch(`/api/reader/comments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) return alert(j?.error || 'Не удалось удалить');
    setPageComments((prev) => prev.filter((c) => c.id !== id && c.parent_id !== id));
  }

  /* ===== UI helpers ===== */
  const surface =
    theme === 'light'
      ? 'bg-white text-gray-900 border border-gray-200'
      : 'bg-[#0B1220] text-white border border-white/10';
  const softSurface =
    theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-white/5 border-white/10';
  const toolbarBtn =
    theme === 'light'
      ? 'px-3 py-1 rounded-md bg-black/5 hover:bg-black/10 text-gray-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 ring-black/20'
      : 'px-3 py-1 rounded-md bg-white/10 hover:bg-white/15 text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 ring-white/20';
  const editorBox = (en: boolean) =>
    theme === 'light'
      ? `min-h-[64px] rounded-lg p-3 outline-none ${en ? 'bg-gray-50' : 'bg-gray-100'}`
      : `min-h-[64px] rounded-lg p-3 outline-none ${
          en ? 'bg-white/5 text-white' : 'bg-white/5 text-white'
        } focus-visible:ring-2 ring-white/20`;
  const sendBtn =
    theme === 'light'
      ? 'px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 ring-slate-400'
      : 'px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 ring-indigo-300/40';
  const listItem =
    theme === 'light'
      ? 'w-full rounded-xl border border-gray-200 bg-white p-4 text-gray-900'
      : 'w-full rounded-xl border border-white/10 bg-white/5 p-4 text-white';
  const replyBox =
    theme === 'light'
      ? 'ml-6 mt-3 border-l border-gray-200 pl-4'
      : 'ml-6 mt-3 border-l border-white/10 pl-4';
  const pagePillBtn =
    theme === 'light'
      ? 'px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200 focus-visible:outline-none focus-visible:ring-2 ring-gray-400'
      : 'px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white border border-white/10 backdrop-blur focus-visible:outline-none focus-visible:ring-2 ring-white/20';

  // переходы страниц
  const prevPage = () => setIndex((i) => Math.max(0, i - 1));
  const nextPage = () => setIndex((i) => Math.min(pages.length - 1, i + 1));

  // клавиши ← →
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prevPage();
      if (e.key === 'ArrowRight') nextPage();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // сортировка
  const [sortMode, setSortMode] = useState<SortMode>('new');
  const roots = pageComments.filter((c) => !c.parent_id);
  const childrenMap = pageComments.reduce<Record<string, PageComment[]>>(
    (a, c) => {
      if (c.parent_id) (a[c.parent_id] ||= []).push(c);
      return a;
    },
    {}
  );
  const cmpNew = (a: PageComment, b: PageComment) =>
    +new Date(b.created_at) - +new Date(a.created_at);
  const cmpOld = (a: PageComment, b: PageComment) =>
    +new Date(a.created_at) - +new Date(b.created_at);
  const cmpTop = (a: PageComment, b: PageComment) =>
    (likesCount[b.id] ?? 0) - (likesCount[a.id] ?? 0) || cmpNew(a, b);
  const base = sortMode === 'new' ? cmpNew : sortMode === 'old' ? cmpOld : cmpTop;
  const sortWithPinned =
    (fn: (a: PageComment, b: PageComment) => number) =>
    (a: PageComment, b: PageComment) => {
      const pa = a.is_pinned ? 1 : 0,
        pb = b.is_pinned ? 1 : 0;
      return pb - pa || fn(a, b);
    };
  const sortFn = sortWithPinned(base);

  const nameOf = (c: PageComment) => {
    if (c.is_team_comment && c.team_id != null)
      return teams[c.team_id!]?.name ?? 'Команда';
    return c.user_id ? profiles[c.user_id]?.username ?? 'Без имени' : 'Аноним';
  };

  if (loading) return <div className="p-6 text-slate-400">Загрузка главы…</div>;
  if (error) return <div className="p-6 text-red-400">Ошибка: {error}</div>;
  if (!pages.length) return <div className="p-6 text-slate-400">Страниц нет</div>;

  const current = pages[index];

  // том/глава/страница (том берём из meta.vol или из первой страницы)
  const volumeToShow =
    (meta?.vol != null ? Number(meta.vol) : pages[0]?.volume_index ?? null) ?? '—';
  const chapterToShow = meta?.chapter_number ?? '—';
  const pageToShow = index + 1;

  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-6 space-y-6">
      {/* Верхняя панель */}
      <div className="mb-1 flex items-center justify-between">
        <div
          className={
            theme === 'light' ? 'text-gray-900 text-sm' : 'text-white text-sm'
          }
        >
          Том {volumeToShow} / Глава {chapterToShow} / Стр. {pageToShow} из {pages.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"
          >
            ↑ Наверх
          </button>
          {nextHref && (
            <Link
              href={nextHref}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"
            >
              Следующая →
            </Link>
          )}
        </div>
      </div>

      {/* Картинка страницы + навигация кликом */}
      <div className={`relative overflow-hidden rounded-xl ${surface}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={`page-${index + 1}`}
          className="w-full h-auto select-none"
          draggable={false}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        <button
          onClick={prevPage}
          className="group absolute inset-y-0 left-0 w-1/2 focus:outline-none"
          aria-label="Prev"
        />
        <button
          onClick={nextPage}
          className="group absolute inset-y-0 right-0 w-1/2 focus:outline-none"
          aria-label="Next"
        />
      </div>

      {/* Переключатель страниц */}
      <div className="flex justify-center">
        <button className={pagePillBtn}>
          Страница {index + 1} из {pages.length}
        </button>
      </div>

      {/* ===== Комментарии ===== */}
      <section className="space-y-4">
        {/* Редактор */}
        <div className={`w-full rounded-xl p-4 ${surface}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => document.execCommand('bold')}
                className={toolbarBtn}
                title="Жирный"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                onClick={() => document.execCommand('italic')}
                className={toolbarBtn}
                title="Курсив"
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                onClick={() => document.execCommand('underline')}
                className={toolbarBtn}
                title="Подчеркнуть"
              >
                <Underline className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const ok = document.execCommand('strikeThrough');
                  if (!ok) try { document.execCommand('strikethrough'); } catch {}
                }}
                className={toolbarBtn}
                title="Зачеркнуть"
              >
                <Strikethrough className="w-4 h-4" />
              </button>
            </div>
            <div
              className={`inline-flex items-center gap-1 rounded-lg border px-1 py-0.5 text-sm ${
                theme === 'light'
                  ? 'border-gray-200'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <button
                onClick={() => setSortMode('new')}
                className={`px-2 py-1 rounded ${
                  sortMode === 'new'
                    ? 'bg-black/10 dark:bg-white/10'
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                Новые
              </button>
              <button
                onClick={() => setSortMode('old')}
                className={`px-2 py-1 rounded ${
                  sortMode === 'old'
                    ? 'bg-black/10 dark:bg-white/10'
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                Старые
              </button>
              <button
                onClick={() => setSortMode('top')}
                className={`px-2 py-1 rounded ${
                  sortMode === 'top'
                    ? 'bg-black/10 dark:bg-white/10'
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                Популярные
              </button>
            </div>
          </div>

          {/* Подсказки / стейт логина */}
          {!userId && (
            <div className="mb-2 text-sm text-yellow-600 dark:text-yellow-300">
              Войдите в систему, чтобы оставлять комментарии
            </div>
          )}

          {replyTo && (
            <div className="mb-2 inline-flex items-center gap-2 text-sm opacity-90">
              <CornerDownRight className="w-4 h-4" /> Ответ на #{replyTo.id.slice(0, 6)}…
              <button
                onClick={() => setReplyTo(null)}
                className="inline-flex items-center gap-1 text-xs opacity-70 hover:opacity-100"
              >
                <X className="w-3 h-3" /> отменить
              </button>
            </div>
          )}

          <div className={`relative rounded-lg border ${softSurface}`}>
            {isEmpty && (
              <span className="pointer-events-none absolute left-3 top-3 text-sm opacity-50">
                {userId ? 'Напишите комментарий…' : 'Войдите, чтобы комментировать'}
              </span>
            )}
            <div
              ref={editorRef}
              contentEditable={!!userId}
              suppressContentEditableWarning
              className={editorBox(!!userId)}
              onInput={() => {
                const txt =
                  editorRef.current?.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
                setIsEmpty(txt.length === 0);
              }}
              onPaste={(e) => {
                if (!userId) return;
                e.preventDefault();
                const text = (e.clipboardData || (window as any).clipboardData)
                  .getData('text/plain');
                document.execCommand('insertText', false, text);
              }}
              onKeyDown={(e) => {
                if (!userId) return;
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void sendComment();
                }
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between">
            <label className={`inline-flex items-center gap-2 ${userId ? '' : 'opacity-50'}`}>
              <input
                type="checkbox"
                disabled={!userId}
                checked={asTeam}
                onChange={(e) => {
                  setAsTeam(e.target.checked);
                  if (!e.target.checked) setPinOnSend(false);
                }}
              />
              <span>От команды</span>
            </label>
            <label
              className={`inline-flex items-center gap-2 ${
                userId && asTeam ? '' : 'opacity-50'
              }`}
            >
              <input
                type="checkbox"
                disabled={!userId || !asTeam}
                checked={pinOnSend}
                onChange={(e) => setPinOnSend(e.target.checked)}
              />
              <span>Закрепить</span>
              {pinOnSend ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
            </label>
            <button
              onClick={sendComment}
              disabled={sending || !userId || isEmpty}
              className={sendBtn}
            >
              {sending ? 'Отправка…' : replyTo ? 'Ответить' : 'Отправить'}
            </button>
          </div>
        </div>

        {/* Список */}
        <div className="space-y-4">
          {roots.length === 0 && (
            <div className="text-center text-sm opacity-70">
              Пока нет комментариев к этой странице — будьте первым!
            </div>
          )}

          {roots.sort(sortFn).map((c) => {
            const replies = (childrenMap[c.id] ?? []).sort(sortFn);
            const me = c.user_id === userId;

            return (
              <article
                key={c.id}
                className={`${listItem} ${
                  c.is_pinned
                    ? theme === 'light'
                      ? 'bg-sky-50 border-sky-200'
                      : 'bg-amber-900/20 border-amber-400/20'
                    : ''
                }`}
              >
                <header className="flex items-center gap-3">
                  {/* аватар */}
                  {c.is_team_comment && c.team_id != null && teams[c.team_id]?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={teams[c.team_id]!.avatar_url!}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : c.user_id && profiles[c.user_id]?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profiles[c.user_id]!.avatar_url!}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/10" />
                  )}

                  <div className="text-sm font-semibold">{nameOf(c)}</div>
                  <div className="text-xs opacity-70">
                    • {new Date(c.created_at).toLocaleString('ru-RU', { hour12: false })}
                  </div>

                  <div className="ml-auto inline-flex items-center gap-3">
                    {c.is_team_comment && c.is_pinned && (
                      <span className="text-xs opacity-80 inline-flex items-center gap-1">
                        <Pin className="w-5 h-5" /> Закреплено
                      </span>
                    )}
                    <button
                      onClick={() => setReplyTo({ id: c.id })}
                      className="inline-flex items-center gap-1 text-xs opacity-80 hover:opacity-100"
                    >
                      <CornerDownRight className="w-5 h-5" /> Ответить
                    </button>
                    <button
                      onClick={() => toggleLike(c.id)}
                      className="inline-flex items-center gap-1 text-xs opacity-80 hover:opacity-100"
                    >
                      <Heart className={`w-3.5 h-3.5 ${likedByMe[c.id] ? 'fill-current' : ''}`} />
                      <span className="tabular-nums">{likesCount[c.id] ?? 0}</span>
                    </button>
                    {me && (
                      <>
                        <button
                          onClick={() => startEdit(c.id, c.content)}
                          className="inline-flex items-center gap-1 text-xs opacity-80 hover:opacity-100"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Редактировать
                        </button>
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="inline-flex items-center gap-1 text-xs opacity-80 hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Удалить
                        </button>
                      </>
                    )}
                  </div>
                </header>

                {editingId === c.id ? (
                  <div className="mt-2">
                    <div
                      ref={editRef}
                      contentEditable
                      suppressContentEditableWarning
                      className={editorBox(true)}
                    />
                    <div className="mt-2 flex gap-2 justify-end">
                      <button onClick={() => saveEdit(c.id)} className={sendBtn}>
                        Сохранить
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          if (editRef.current) editRef.current.innerHTML = '';
                        }}
                        className="px-4 py-2 rounded-lg border border-white/20 hover:bg-white/5"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="mt-2 text-[15px] leading-relaxed break-words prose prose-sm max-w-none dark:text-white"
                    dangerouslySetInnerHTML={{ __html: c.content }}
                  />
                )}

                {replies.length > 0 && (
                  <div className={replyBox}>
                    <div className="space-y-3">
                      {replies.map((r) => {
                        const mine = r.user_id === userId;
                        return (
                          <div
                            key={r.id}
                            className={`rounded-lg p-3 ${
                              r.is_pinned
                                ? 'bg-sky-50 dark:bg-amber-900/20'
                                : 'bg-black/5 dark:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-medium">{nameOf(r)}</div>
                              <div className="text-[11px] opacity-70">
                                •{' '}
                                {new Date(r.created_at).toLocaleString('ru-RU', {
                                  hour12: false,
                                })}
                              </div>
                              <div className="ml-auto inline-flex items-center gap-3">
                                <button
                                  onClick={() => setReplyTo({ id: c.id })}
                                  className="inline-flex items-center gap-1 text-[11px] opacity-80 hover:opacity-100"
                                >
                                  <CornerDownRight className="w-3 h-3" /> Ответить
                                </button>
                                <button
                                  onClick={() => toggleLike(r.id)}
                                  className="inline-flex items-center gap-1 text-[11px] opacity-80 hover:opacity-100"
                                >
                                  <Heart
                                    className={`w-3 h-3 ${likedByMe[r.id] ? 'fill-current' : ''}`}
                                  />
                                  <span className="tabular-nums">
                                    {likesCount[r.id] ?? 0}
                                  </span>
                                </button>
                                {mine && (
                                  <>
                                    <button
                                      onClick={() => startEdit(r.id, r.content)}
                                      className="inline-flex items-center gap-1 text-[11px] opacity-80 hover:opacity-100"
                                    >
                                      <Pencil className="w-3 h-3" /> Редактировать
                                    </button>
                                    <button
                                      onClick={() => deleteComment(r.id)}
                                      className="inline-flex items-center gap-1 text-[11px] opacity-80 hover:opacity-100"
                                    >
                                      <Trash2 className="w-3 h-3" /> Удалить
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            {editingId === r.id ? (
                              <div className="mt-1">
                                <div
                                  ref={editRef}
                                  contentEditable
                                  suppressContentEditableWarning
                                  className={editorBox(true)}
                                />
                                <div className="mt-2 flex gap-2 justify-end">
                                  <button onClick={() => saveEdit(r.id)} className={sendBtn}>
                                    Сохранить
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingId(null);
                                      if (editRef.current) editRef.current.innerHTML = '';
                                    }}
                                    className="px-4 py-2 rounded-lg border border-white/20 hover:bg-white/5"
                                  >
                                    Отмена
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="mt-1 text[13px] leading-relaxed break-words prose prose-sm max-w-none dark:prose-invert"
                                dangerouslySetInnerHTML={{ __html: r.content }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
