'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { Header } from '@/components/Header';
import ViewCounter from '@/components/ViewCounter';
import TitleBookmarks from '@/components/TitleBookmarks';
import AddChapterButton from '@/components/AddChapterButton';
import ReportForm from '@/components/comments/ReportForm';

import { useTheme } from '@/lib/theme/context';
import { romajiSlug, makeIdSlug } from '@/lib/slug';

import {
  Star,
  BookOpen,
  MessageSquare,
  User,
  AlertTriangle,
  Edit3,
  Brush,
  Eye,
  Pin,
  CornerDownRight,
  Trash2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  X,
} from 'lucide-react';

/* ================= Types ================= */
type Manga = {
  id: number;
  title: string;
  cover_url?: string | null;
  author?: string | null;
  artist?: string | null;
  description?: string | null;
  status?: string | null;
  release_year?: number | null;
  rating?: number | null;
  rating_count?: number | null;
  original_title?: string | null;
  title_romaji?: string | null;
  tags?: string[] | null;
};

type Chapter = {
  id: number;
  manga_id: number;
  chapter_number: number;
  title?: string | null;
  created_at: string;
  status?: string | null; // published/unpublished
};

type Genre = { id: number | string; manga_id: number; genre: string };
type Team = { id: number; name: string; slug?: string | null; avatar_url?: string | null; verified?: boolean | null };
type RatingRow = { id: string; manga_id: number; rating: number; user_id?: string | null };
type ProfileLite = { id: string; username?: string | null; avatar_url?: string | null } | null;

type CommentRow = {
  id: string;
  manga_id: number;
  user_id: string | null;
  comment: string; // HTML
  created_at: string;
  parent_id?: string | null;
  is_team_comment?: boolean | null;
  team_id?: number | null;
  is_pinned?: boolean | null;
  profile?: ProfileLite;
  team?: { id: number; name: string; avatar_url?: string | null } | null;

  // жалобы/скрытие
  is_hidden?: boolean | null;
  reports_count?: number | null;
};

/* ================= Utils ================= */
function formatRelease(m: Manga) {
  if (typeof m.release_year === 'number' && m.release_year > 0) return String(m.release_year);
  return '—';
}

/** CSV/array -> string[]: для фолбэка из колонок manga.tags */
function toStrArr(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/[,\n;]+/g).map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Безопасно парсим JSON-ответ. Не бросает, если тело пустое/не-JSON */
async function safeJson<T = any>(res: Response): Promise<T | null> {
  const ct = res.headers.get('content-type') || '';
  const txt = await res.text();
  if (!txt) return null;
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(txt) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/** Безопасный fetch JSON (не бросает исключения, не создаёт Console SyntaxError) */
async function getJson(url: string) {
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    const data = await safeJson(r);
    return r.ok ? (data ?? {}) : {};
  } catch {
    return {};
  }
}

/** Простая «санитизация»: разрешаем <b/i/u/s>, <br>, strong/em и преобразуем span со стилями в эти теги */
function sanitize(input: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'text/html');

  function clean(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const pass = new Set(['b', 'i', 'u', 's', 'br', 'strong', 'em']);

    if (tag === 'strike' || tag === 'del') {
      const out = document.createElement('s');
      el.childNodes.forEach((ch) => {
        const c = clean(ch);
        if (c) out.appendChild(c);
      });
      return out;
    }

    if (pass.has(tag)) {
      const out = document.createElement(tag);
      el.childNodes.forEach((ch) => {
        const c = clean(ch);
        if (c) out.appendChild(c);
      });
      return out;
    }

    if (tag === 'span') {
      const out = document.createElement('span');
      const st = el.style;
      if (st.fontWeight === 'bold' || st.fontWeight === '700') out.style.fontWeight = 'bold';
      if (st.fontStyle === 'italic') out.style.fontStyle = 'italic';
      const td = st.textDecoration || st.textDecorationLine || '';
      const u = /underline/i.test(td);
      const s = /line-through|strike/i.test(td);
      if (u && s) out.style.textDecoration = 'underline line-through';
      else if (u) out.style.textDecoration = 'underline';
      else if (s) out.style.textDecoration = 'line-through';

      if (!out.getAttribute('style')) {
        const frag = document.createDocumentFragment();
        el.childNodes.forEach((ch) => {
          const c = clean(ch);
          if (c) frag.appendChild(c);
        });
        return frag;
      }
      el.childNodes.forEach((ch) => {
        const c = clean(ch);
        if (c) out.appendChild(c);
      });
      return out;
    }

    const frag = document.createDocumentFragment();
    el.childNodes.forEach((ch) => {
      const c = clean(ch);
      if (c) frag.appendChild(c);
    });
    return frag;
  }

  const frag = document.createDocumentFragment();
  doc.body.childNodes.forEach((ch) => {
    const c = clean(ch);
    if (c) frag.appendChild(c);
  });

  const div = document.createElement('div');
  div.appendChild(frag);
  return div.innerHTML.replace(/&nbsp;/gi, ' ').replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>').trim();
}

/* =========================================================
   Title page
   ========================================================= */
const REPORTS_HIDE_THRESHOLD = 5;

export default function MangaTitlePage({
  mangaId,
  initialChapters = [],
}: {
  mangaId: number;
  initialChapters?: Chapter[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();

  /* ===== THEME PRESETS ===== */
  const pageBg =
    theme === 'light'
      ? 'bg-gray-50 text-gray-900'
      : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-100';

  const card = theme === 'light' ? 'bg-white border-gray-200' : 'bg-gray-900/40 border-white/10';
  const subtleCard = theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-gray-950/40 border-white/10';
  const titleText = theme === 'light' ? 'text-gray-900' : 'text-white';
  const bodyText = theme === 'light' ? 'text-gray-800' : 'text-gray-200';
  const mutedText = theme === 'light' ? 'text-gray-600' : 'text-gray-400';
  const chip =
    theme === 'light' ? 'bg-gray-100 border-gray-200 text-gray-700' : 'bg-white/10 border-white/10 text-gray-100';
  const primaryBtn =
    theme === 'light' ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-black hover:opacity-90';
  const secondaryBtn =
    theme === 'light'
      ? 'border-gray-300 bg-white hover:bg-gray-100 text-gray-900'
      : 'border-white/10 bg-gray-800/60 hover:bg-gray-700 text-white';
  const warnBtn =
    theme === 'light'
      ? 'border-yellow-400/40 bg-yellow-100 text-yellow-900 hover:bg-yellow-200'
      : 'border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-100';
  const tabActive = theme === 'light' ? 'bg-slate-900 text-white' : 'bg-white text-black';
  const tabIdle =
    theme === 'light' ? 'bg-white hover:bg-gray-100 text-gray-800' : 'bg-gray-900/60 hover:bg-gray-800 text-gray-100';

  // Комментарии — UI
  const cWrap =
    theme === 'light'
      ? 'my-4 w-full rounded-xl p-4 bg-white text-gray-900 border border-gray-200'
      : 'my-4 w-full rounded-xl p-4 bg-slate-900 text-slate-100 border border-white/10';
  const cBtn =
    theme === 'light'
      ? 'px-3 py-1 rounded bg-black/5 hover:bg-black/10 text-gray-800 disabled:opacity-50'
      : 'px-3 py-1 rounded bg-white/10 hover:bg-white/15 text-white disabled:opacity-50';
  const cPlaceholder = theme === 'light' ? 'text-gray-500' : 'text-slate-400';
  const cEditor = (enabled: boolean) =>
    theme === 'light'
      ? `min-h-[64px] rounded-lg p-3 outline-none ${enabled ? 'bg-gray-50' : 'bg-gray-100 cursor-not-allowed'}`
      : `min-h-[64px] rounded-lg p-3 outline-none ${enabled ? 'bg-slate-800/70' : 'bg-slate-800/30 cursor-not-allowed'}`;
  const cSendBtn =
    theme === 'light'
      ? 'px-4 py-2 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50'
      : 'px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50';
  const cItem =
    theme === 'light'
      ? 'w-full rounded-xl border border-gray-200 bg-white p-4'
      : 'w-full rounded-xl border border-white/10 bg-slate-900 p-4';
  const cReply = theme === 'light' ? 'ml-6 mt-3 border-l border-gray-200 pl-4' : 'ml-6 mt-3 border-l border-white/10 pl-4';

  /* ===== STATE ===== */
  const [manga, setManga] = useState<Manga | null>(null);
  const [realId, setRealId] = useState<number | null>(null);

  // списки
  const [tags, setTags] = useState<string[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [tab, setTab] = useState<'chapters' | 'comments'>('chapters');
  const [loading, setLoading] = useState(true);

  // auth/me
  const [me, setMe] = useState<{ id: string; username?: string | null; role?: string | null; leaderTeamId?: number | null } | null>(null);

  // Редактор
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; username?: string } | null>(null);
  const [asTeam, setAsTeam] = useState(false);
  const [pinOnSend, setPinOnSend] = useState(false);

  const canEdit = (me?.role === 'moderator' || me?.role === 'admin') ?? false;
  const isLeader = Boolean(me?.leaderTeamId);

  /* ===== COLLAPSE states ===== */
  const TAGS_MAX = 2;
  const GENRES_MAX = 3;
  const [showAllTags, setShowAllTags] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);

  const DESC_LINES = 4;
  const [descExpanded, setDescExpanded] = useState(false);
  const hasLongDesc = (manga?.description ?? '').trim().length > 260;

  // ключ для первого запроса: последний сегмент URL (/manga/<тут>) или число из пропсов
  const apiKey = useMemo(() => {
    const seg = (pathname ?? '').split('/').filter(Boolean).pop() || '';
    return seg || String(mangaId);
  }, [pathname, mangaId]);

  // удобный id для ссылок и счётчиков
  const mid = realId ?? mangaId;

  /* ===== LOAD DATA ===== */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      // 1) базовая карточка
      const mJ = await getJson(`/api/manga/${apiKey}`);
      if (cancelled) return;

      const found: Manga | null = (mJ as any)?.item ?? null;
      setManga(found);

      const id = Number(found?.id ?? 0) || null;
      setRealId(id);

      if (!id) {
        setGenres([]); setChapters([]); setComments([]); setRatings([]); setTags([]); setTeams([]);
        setLoading(false);
        return;
      }

      // 2) остальное по реальному id
      const [gJ, chJ, cJ, rJ, tJ, tmJ, meJ] = await Promise.all([
        getJson(`/api/manga/${id}/genres`),
        getJson(`/api/manga/${id}/chapters?status=published`),
        getJson(`/api/manga/${id}/comments`),
        getJson(`/api/manga/${id}/ratings`),
        getJson(`/api/manga/${id}/tags`),
        getJson(`/api/manga/${id}/teams`),
        getJson(`/api/me`),
      ]);

      if (cancelled) return;

      setGenres(Array.isArray((gJ as any)?.items) ? (gJ as any).items : []);

      const chItems: Chapter[] = Array.isArray((chJ as any)?.items) ? (chJ as any).items : [];
      setChapters(chItems.filter((c) => (c.status ?? 'published') === 'published'));

      setComments(Array.isArray((cJ as any)?.items) ? (cJ as any).items : []);
      setRatings(Array.isArray((rJ as any)?.items) ? (rJ as any).items : []);
      setTags(Array.isArray((tJ as any)?.items) ? (tJ as any).items : toStrArr(found?.tags));
      setTeams(Array.isArray((tmJ as any)?.items) ? (tmJ as any).items : []);
      setMe((meJ as any)?.id ? (meJ as any) : null);

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [apiKey]);

  /* ===== Канонический URL ===== */
  const idSlug = useMemo(() => {
    const raw = manga?.original_title || manga?.title_romaji || manga?.title || '';
    const slug = romajiSlug(raw);
    return slug ? makeIdSlug(mid, slug) : String(mid);
  }, [mid, manga]);

  useEffect(() => {
    if (!manga) return;
    const want = `/manga/${idSlug}`;
    if (pathname !== want) router.replace(want, { scroll: false });
  }, [manga, idSlug, pathname, router]);

  /* ===== Рейтинг (просмотр) ===== */
  const ratingAverage =
    ratings.length > 0
      ? Number((ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / ratings.length).toFixed(2))
      : manga?.rating ?? 0;
  const ratingCount = ratings.length || (manga?.rating_count ?? 0);
  const ratingPct = (Math.min(10, Math.max(0, ratingAverage)) / 10) * 100;

  /* ===== threads (reply) ===== */
  const threads = useMemo(() => {
    const roots: CommentRow[] = [];
    const children: Record<string, CommentRow[]> = {};
    for (const c of comments) {
      const pid = c.parent_id ?? null;
      if (pid) (children[pid] ||= []).push(c);
      else roots.push(c);
    }
    return { roots, children };
  }, [comments]);

  /* ===== права на действия ===== */
  const canTogglePin = (c: CommentRow) => {
    const isOwnTeam = isLeader && c.is_team_comment && c.team_id === me?.leaderTeamId;
    return Boolean(canEdit || isOwnTeam);
  };
  const canDeleteComment = (c: CommentRow) => {
    const isAuthor = me?.id && c.user_id === me.id;
    const isOwnTeam = isLeader && c.is_team_comment && c.team_id === me?.leaderTeamId;
    return Boolean(isAuthor || canEdit || isOwnTeam);
  };

  /* ===== Отправка комментария ===== */
  const submitComment = useCallback(async () => {
    if (sending || !me) return;

    const plain = editorRef.current?.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
    if (!plain) return;

    const html = sanitize(editorRef.current?.innerHTML ?? '');
    if (!html) return;

    setSending(true);
    try {
      const res = await fetch(`/api/manga/${mid}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          comment: html,
          parent_id: replyTo?.id || null,
          as_team: asTeam || false,
          pin: asTeam && pinOnSend ? true : false,
        }),
      });
      const data = await safeJson<{ item?: CommentRow; message?: string }>(res);
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

      const inserted: CommentRow | null = data?.item ?? null;
      if (inserted) setComments((prev) => [...prev, inserted]);

      if (editorRef.current) editorRef.current.innerHTML = '';
      setIsEmpty(true);
      setReplyTo(null);
      setAsTeam(false);
      setPinOnSend(false);
    } catch (e: any) {
      alert(e?.message || 'Ошибка отправки');
    } finally {
      setSending(false);
    }
  }, [sending, mid, me, replyTo, asTeam, pinOnSend]);

  /* ===== Закреп / откреп ===== */
  const togglePin = useCallback(async (c: CommentRow) => {
    if (!canTogglePin(c)) return;
    try {
      const res = await fetch(`/api/manga/${mid}/comments/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_pinned: !c.is_pinned }),
      });
      const j = await safeJson<{ message?: string }>(res);
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);

      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_pinned: !c.is_pinned } : x)));
    } catch (e: any) {
      alert(e?.message || 'Ошибка');
    }
  }, [mid, comments]);

  /* ===== Удаление ===== */
  const deleteComment = useCallback(async (c: CommentRow) => {
    if (!canDeleteComment(c)) return;
    if (!confirm('Удалить комментарий? Будут удалены и ответы.')) return;
    try {
      const res = await fetch(`/api/manga/${mid}/comments/${c.id}`, { method: 'DELETE', credentials: 'include' });
      const j = await safeJson<{ message?: string }>(res);
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);

      setComments((prev) => prev.filter((x) => x.id !== c.id && x.parent_id !== c.id));
    } catch (e: any) {
      alert(e?.message || 'Ошибка');
    }
  }, [mid]);

  /* ===== Оценка (upsert) ===== */
  async function handleRate(value: number) {
    if (!me) {
      alert('Нужно войти, чтобы оценивать.');
      return;
    }
    const r = await fetch(`/api/manga/${mid}/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ rating: value }),
    });
    const j = await safeJson<{ message?: string }>(r);
    if (!r.ok) {
      alert(j?.message || 'Не удалось сохранить оценку');
      return;
    }
    const fresh = await getJson(`/api/manga/${mid}/ratings`);
    setRatings(Array.isArray((fresh as any)?.items) ? (fresh as any).items : []);
  }

  /* ===== Привязка / отвязка моей команды ===== */
  const hasMyTeam = useMemo(
    () => Boolean(me?.leaderTeamId && teams.some(t => Number(t.id) === Number(me.leaderTeamId))),
    [teams, me?.leaderTeamId]
  );

  async function attachMyTeam() {
    if (!me?.leaderTeamId) {
      alert('Вы не лидер ни одной команды.');
      return;
    }
    try {
      const r = await fetch(`/api/manga/${mid}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ team_id: me.leaderTeamId }),
      });
      const j = await safeJson<{ ok?: boolean; items?: Team[]; message?: string }>(r);
      if (!r.ok || !j?.ok) throw new Error(j?.message || `HTTP ${r.status}`);
      setTeams(Array.isArray(j.items) ? j.items : teams);
    } catch (e: any) {
      alert(e?.message || 'Не удалось привязать команду');
    }
  }

  async function detachMyTeam() {
    if (!me?.leaderTeamId) return;
    if (!confirm('Отвязать вашу команду от тайтла?')) return;
    try {
      const r = await fetch(`/api/manga/${mid}/teams/${me.leaderTeamId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const j = await safeJson<{ ok?: boolean; message?: string }>(r);
      if (!r.ok || !j?.ok) throw new Error(j?.message || `HTTP ${r.status}`);

      const fresh = await getJson(`/api/manga/${mid}/teams`);
      setTeams(Array.isArray((fresh as any)?.items) ? (fresh as any).items : []);
    } catch (e: any) {
      alert(e?.message || 'Не удалось отвязать команду');
    }
  }

  /* ===== Loading / Not found ===== */
  if (loading)
    return (
      <div key={pathname} className={`min-h-screen ${pageBg}`}>
        <Header showSearch={false} />
        <div className="flex items-center justify-center h-[60vh] text-sm opacity-70">Загрузка…</div>
      </div>
    );

  if (!manga)
    return (
      <div className={`min-h-screen ${pageBg}`}>
        <Header showSearch={false} />
        <div className="p-6 text-sm opacity-70">Тайтл не найден.</div>
      </div>
    );

  /* ================= Render ================= */
  return (
    <div className={`min-h-screen ${pageBg}`}>
      <Header showSearch={false} />

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* HERO */}
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-8">
          {/* Cover */}
          <div className={`relative rounded-3xl overflow-hidden border ${card}`}>
            <div className="relative w-full h-[560px]">
              <Image
                src={manga.cover_url || '/cover-placeholder.png'}
                alt={manga.title}
                fill
                sizes="(max-width: 1024px) 100vw, 420px"
                className="object-cover"
                priority
              />
            </div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute left-0 right-0 bottom-0 p-6">
              <h1 className="text-white text-4xl md:text-5xl font-extrabold tracking-tight drop-shadow-lg">
                {manga.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-white/90">
                  <User className="h-4 w-4 opacity-80" />
                  {manga.author || 'Автор неизвестен'}
                </span>
                {manga.artist && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-white/90">
                    <Brush className="h-4 w-4 opacity-80" />
                    {manga.artist}
                  </span>
                )}

                {teams.map((t) => (
                  <Link
                    key={t.id}
                    href={`/team/${t.slug ?? String(t.id)}`}
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-white/90 hover:bg-white/20"
                    title={`Переводчик: ${t.name}`}
                  >
                    <User className="h-4 w-4 opacity-80" />
                    {t.name}
                  </Link>
                ))}

                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-white/90">
                  <MessageSquare className="h-4 w-4 opacity-80" />
                  {comments.length} комм.
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-white/90">
                  <BookOpen className="h-4 w-4 opacity-80" />
                  {chapters.length} глав
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-white/90">
                  <Eye className="h-4 w-4 opacity-80" />
                  <ViewCounter slug={`manga:${mid}`} showIcon={false} />
                </span>
              </div>
            </div>
          </div>

          {/* Правая колонка */}
          <div className="flex flex-col gap-6">
            <div className={`rounded-2xl border p-5 ${card}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {/* ЖАНРЫ */}
                  <div className={`text-sm uppercase tracking-wider ${mutedText}`}>ЖАНРЫ</div>
                  {genres.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {(showAllGenres ? genres : genres.slice(0, GENRES_MAX)).map((g) => (
                        <span key={String(g.id)} className={`rounded-full border px-3 py-1 text-sm ${chip}`}>
                          {g.genre}
                        </span>
                      ))}
                      {genres.length > GENRES_MAX && (
                        <button type="button" onClick={() => setShowAllGenres((v) => !v)} className={`text-xs underline ${mutedText}`}>
                          {showAllGenres ? 'Свернуть' : `Показать ещё ${genres.length - GENRES_MAX}`}
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className={`text-sm ${mutedText}`}>Жанры не указаны</span>
                  )}

                  {/* ТЕГИ */}
                  <div className={`mt-4 text-sm uppercase tracking-wider ${mutedText}`}>ТЕГИ</div>
                  {tags.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {(showAllTags ? tags : tags.slice(0, TAGS_MAX)).map((t, i) => (
                        <span key={`${t}-${i}`} className={`rounded-full border px-2 py-0.5 text-xs ${chip}`}>
                          {t}
                        </span>
                      ))}
                      {tags.length > TAGS_MAX && (
                        <button type="button" onClick={() => setShowAllTags((v) => !v)} className={`text-xs underline ${mutedText}`}>
                          {showAllTags ? 'Свернуть' : `Показать ещё ${tags.length - TAGS_MAX}`}
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className={`text-sm ${mutedText}`}>Теги не указаны</span>
                  )}

                  {/* Прочая мета */}
                  <div className={`flex items-center gap-2 pt-2 text-xs ${mutedText}`}>
                    <span>Релиз:&nbsp;</span>
                    <span className={bodyText}>{formatRelease(manga)}</span>
                  </div>

                  {/* Переводчики + кнопка привязки */}
                  <div className={`text-sm ${bodyText}`}>
                    <span className={`${mutedText}`}>Переводчик(и): </span>
                    {teams.length ? (
                      <span className="space-x-1">
                        {teams.map((t, i) => (
                          <Link key={t.id} href={`/team/${t.slug ?? String(t.id)}`} className="hover:underline" title={t.name}>
                            {t.name}
                            {i < teams.length - 1 ? ', ' : ''}
                          </Link>
                        ))}
                      </span>
                    ) : (
                      '—'
                    )}
                    {me?.leaderTeamId && (
                      <span className="ml-2 inline-flex items-center gap-2">
                        {hasMyTeam ? (
                          <button onClick={detachMyTeam} className="text-xs underline opacity-80 hover:opacity-100">
                            отвязать мою команду
                          </button>
                        ) : (
                          <button onClick={attachMyTeam} className="text-xs underline opacity-80 hover:opacity-100">
                            привязать мою команду
                          </button>
                        )}
                      </span>
                    )}
                  </div>

                  {manga.status && (
                    <div className={`text-sm ${bodyText}`}>
                      <span className={`${mutedText}`}>Статус: </span>
                      {manga.status}
                    </div>
                  )}
                </div>

                {/* Рейтинг */}
                <div className={`rounded-xl border p-4 ${subtleCard}`}>
                  <div className="flex items-center gap-3">
                    <Star className="h-7 w-7 text-yellow-400 fill-yellow-400" />
                    <div className={`text-4xl font-bold ${titleText}`}>
                      {ratingAverage
                        ? ratingAverage.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '—'}
                    </div>
                    <div className={`text-xs ${mutedText}`}>на основе {ratingCount} оценок</div>
                  </div>

                  <div className="mt-4 h-3 w-full rounded-full overflow-hidden" style={{ background: theme === 'light' ? '#e5e7eb' : 'rgba(255,255,255,0.1)' }}>
                    <div className="h-full rounded-full" style={{ width: `${ratingPct}%`, background: 'linear-gradient(90deg,#facc15 0%, #22c55e 100%)' }} />
                  </div>

                  <div className="mt-3 h-2 w-full rounded-full overflow-hidden" style={{ background: theme === 'light' ? '#e5e7eb' : 'rgba(255,255,255,0.1)' }}>
                    <div className="h-full rounded-full" style={{ width: `${ratingPct}%`, background: theme === 'light' ? '#f59e0b' : '#facc15' }} />
                  </div>

                  <div className="mt-4 grid grid-cols-10 gap-2">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                      <button
                        key={v}
                        onClick={() => handleRate(v)}
                        className={`h-9 rounded-md border text-sm transition-colors ${
                          theme === 'light'
                            ? 'border-gray-300 hover:bg-gray-100 text-gray-800'
                            : 'border-white/10 hover:bg-white/10 text-white'
                        }`}
                        title={`Оценить на ${v}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Описание */}
              <div className="mt-6">
                <div className={`text-sm uppercase tracking-wider mb-2 ${mutedText}`}>О тайтле</div>
                <p
                  className={`leading-relaxed ${bodyText}`}
                  style={
                    descExpanded
                      ? {}
                      : {
                          display: '-webkit-box',
                          WebkitLineClamp: String(DESC_LINES) as any,
                          WebkitBoxOrient: 'vertical' as any,
                          overflow: 'hidden',
                          whiteSpace: 'pre-line',
                        }
                  }
                >
                  {manga.description || 'Описание пока отсутствует.'}
                </p>
                {hasLongDesc && (
                  <button type="button" onClick={() => setDescExpanded((v) => !v)} className={`mt-2 text-sm underline ${mutedText}`}>
                    {descExpanded ? 'Свернуть' : 'Показать полностью'}
                  </button>
                )}
              </div>
            </div>

            {/* Действия */}
            <div className="flex flex-wrap items-center gap-3">
              {chapters.length > 0 ? (
                <a
                  href={`/manga/${idSlug}/chapter/${chapters[0]?.id ?? ''}`}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm ${primaryBtn}`}
                >
                  <BookOpen className="h-4 w-4" />
                  Читать первую доступную главу
                </a>
              ) : (
                <span className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm opacity-60 cursor-not-allowed ${primaryBtn}`}>
                  <BookOpen className="h-4 w-4" />
                  Нет опубликованных глав
                </span>
              )}

              <a href={`/title/${mid}/error`} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm border ${warnBtn}`}>
                <AlertTriangle className="h-4 w-4" />
                Сообщить об ошибке
              </a>

              {(me?.role === 'moderator' || me?.role === 'admin') && (
                <a href={`/title/${mid}/edit`} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm border ${secondaryBtn}`}>
                  <Edit3 className="h-4 w-4" />
                  Редактировать
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <TitleBookmarks mangaId={mid} />
        </div>

        {/* Вкладки + кнопка справа */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <div className={`inline-grid grid-cols-2 rounded-xl overflow-hidden border ${theme === 'light' ? 'border-gray-200' : 'border-white/10'}`}>
              <button onClick={() => setTab('chapters')} className={`px-4 py-2 text-sm transition-colors ${tab === 'chapters' ? tabActive : tabIdle}`}>
                Главы
              </button>
              <button onClick={() => setTab('comments')} className={`px-4 py-2 text-sm transition-colors ${tab === 'comments' ? tabActive : tabIdle}`}>
                Комментарии
              </button>
            </div>

            {tab === 'chapters' && (
              <div className="ml-3">
                <AddChapterButton mangaId={mid} onDone={() => window.location.reload()} />
              </div>
            )}
          </div>

          {tab === 'chapters' ? (
            <div className={`mt-4 rounded-2xl border ${card}`}>
              <div className={`flex items-center justify-between p-3 border-b ${theme === 'light' ? 'border-gray-200' : 'border-white/10'}`}>
                <span className={`font-semibold ${titleText}`}>Список глав</span>
              </div>
              <div className={`divide-y ${theme === 'light' ? 'divide-gray-200' : 'divide-white/10'}`}>
                {chapters.map((ch) => (
                  <div
                    key={ch.id}
                    className={`flex items-center justify-between p-3 transition-colors ${
                      theme === 'light' ? 'hover:bg-gray-50' : 'hover:bg-gray-800/50'
                    }`}
                  >
                    <div>
                      <div className={`font-medium ${titleText}`}>
                        Глава {ch.chapter_number}
                        {ch.title ? ` — ${ch.title}` : ''}
                      </div>
                      <div className={`text-xs ${mutedText}`}>{new Date(ch.created_at).toLocaleDateString('ru-RU')}</div>
                    </div>
                    <a href={`/manga/${idSlug}/chapter/${ch.id}`} className={`text-sm px-3 py-1 rounded-lg ${primaryBtn}`}>
                      Читать
                    </a>
                  </div>
                ))}
                {chapters.length === 0 && <div className={`p-4 text-sm ${mutedText}`}>Глав пока нет.</div>}
              </div>
            </div>
          ) : (
            /* ===== Комментарии ===== */
            <div className="mt-4">
              {/* редактор */}
              <div className={cWrap}>
                <div className="mb-2 flex gap-2 flex-wrap">
                  <button disabled={!me} onClick={() => document.execCommand('bold')} className={cBtn} title="Жирный">
                    <Bold className="w-4 h-4" /> <span>Жирный</span>
                  </button>
                  <button disabled={!me} onClick={() => document.execCommand('italic')} className={cBtn} title="Курсив">
                    <Italic className="w-4 h-4" /> <span>Курсив</span>
                  </button>
                  <button disabled={!me} onClick={() => document.execCommand('underline')} className={cBtn} title="Подчеркнуть">
                    <Underline className="w-4 h-4" /> <span>Подчеркнуть</span>
                  </button>
                  <button
                    disabled={!me}
                    onClick={() => {
                      const ok = document.execCommand('strikeThrough');
                      if (!ok) {
                        try { document.execCommand('strikethrough'); } catch {}
                      }
                    }}
                    className={cBtn}
                    title="Зачеркнуть"
                  >
                    <Strikethrough className="w-4 h-4" /> <span>Зачеркнуть</span>
                  </button>

                  {isLeader && (
                    <div className="mb-2 flex items-center gap-6 text-sm opacity-90">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
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
                          asTeam ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <input type="checkbox" checked={pinOnSend} disabled={!asTeam} onChange={(e) => setPinOnSend(e.target.checked)} />
                        <span>Закрепить</span>
                      </label>
                    </div>
                  )}
                </div>

                {!me && (
                  <div className={`text-xs ${theme === 'light' ? 'text-gray-500' : 'text-slate-300/80'} mb-2`}>
                    Вы не вошли. <a href="/login" className="underline">Войти</a>
                  </div>
                )}

                {replyTo && (
                  <div className={`mb-2 flex items-center gap-2 text-sm ${theme === 'light' ? 'text-gray-700' : 'text-slate-200'}`}>
                    <CornerDownRight className="w-4 h-4" />
                    Ответ для <span className="font-medium">@{replyTo.username ?? `коммент #${replyTo.id}`}</span>
                    <button onClick={() => setReplyTo(null)} className="ml-auto inline-flex items-center gap-1 text-xs opacity-80 hover:opacity-100">
                      <X className="w-3 h-3" /> отменить
                    </button>
                  </div>
                )}

                <div className="relative">
                  {isEmpty && (
                    <span className={`pointer-events-none absolute left-3 top-3 text-sm ${cPlaceholder}`}>
                      {me ? 'Оставьте комментарий…' : 'Войдите, чтобы оставить комментарий'}
                    </span>
                  )}
                  <div
                    ref={editorRef}
                    role="textbox"
                    aria-label="Поле ввода комментария"
                    contentEditable={!!me}
                    suppressContentEditableWarning
                    className={cEditor(!!me)}
                    onInput={() => {
                      const plain = editorRef.current?.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
                      setIsEmpty(!plain);
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = (e.clipboardData || (window as any).clipboardData).getData('text/plain');
                      document.execCommand('insertText', false, text);
                    }}
                    onKeyDown={(e) => {
                      if (!me) return;
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void submitComment();
                      }
                    }}
                  />
                </div>

                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={submitComment} disabled={!me || sending || isEmpty} className={cSendBtn}>
                    {sending ? 'Отправка…' : replyTo ? 'Ответить' : 'Отправить'}
                  </button>
                </div>
              </div>

              {/* список */}
              <div className="space-y-4">
                {threads.roots.length === 0 && <div className={`text-sm text-center ${mutedText}`}>Пока нет комментариев</div>}

                {threads.roots
                  .slice()
                  .sort((a, b) => {
                    const pa = a.is_pinned ? 1 : 0;
                    const pb = b.is_pinned ? 1 : 0;
                    if (pa !== pb) return pb - pa;
                    return +new Date(a.created_at) - +new Date(b.created_at);
                  })
                  .map((c) => {
                    const replies = threads.children[c.id] || [];
                    const isTeam = c.is_team_comment && c.team_id != null;
                    const team = isTeam ? teams.find((t) => t.id === Number(c.team_id)) : null;
                    const displayName = isTeam ? team?.name ?? 'Команда' : c.profile?.username ?? 'Пользователь';
                    const avatarUrl = isTeam ? team?.avatar_url ?? null : c.profile?.avatar_url ?? null;
                    const initials = (isTeam ? team?.name?.[0] : c.profile?.username?.[0])?.toUpperCase() ?? '?';

                    const hiddenNow = Boolean(c.is_hidden) || Number(c.reports_count ?? 0) >= REPORTS_HIDE_THRESHOLD;

                    return (
                      <article
                        key={c.id}
                        className={`${cItem} ${
                          c.is_pinned
                            ? theme === 'light'
                              ? 'bg-yellow-50 border-yellow-200'
                              : 'bg-amber-900/20 border-amber-400/20'
                            : ''
                        }`}
                      >
                        <header className="flex items-center gap-3">
                          <div
                            className={`h-9 w-9 rounded-full overflow-hidden flex items-center justify-center text-xs ${
                              theme === 'light' ? 'bg-gray-200 text-gray-700' : 'bg-gray-700 text-white'
                            }`}
                          >
                            {avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                            ) : (
                              <span>{initials}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className={`text-sm font-medium ${titleText}`}>{displayName}</div>
                            <div className={`text-xs ${mutedText}`}>{new Date(c.created_at).toLocaleString('ru-RU')}</div>
                          </div>

                          <div className="ml-auto flex items-center gap-2">
                            {!hiddenNow && (
                              <button
                                className="text-xs opacity-70 hover:opacity-100 inline-flex items-center gap-1"
                                onClick={() => setReplyTo({ id: c.id, username: c.profile?.username || undefined })}
                              >
                                <CornerDownRight className="w-3.5 h-3.5" />
                                Ответить
                              </button>
                            )}

                            {/* КНОПКА ЖАЛОБЫ */}
                            <ReportForm
                              mangaId={mid}
                              commentId={c.id}
                              onDone={(hidden) => {
                                setComments(prev =>
                                  prev.map(x => {
                                    if (x.id !== c.id) return x;
                                    const newCount = Number(x.reports_count ?? 0) + 1;
                                    const shouldHide = hidden || newCount >= REPORTS_HIDE_THRESHOLD;
                                    return { ...x, reports_count: newCount, is_hidden: shouldHide ? true : x.is_hidden };
                                  })
                                );
                              }}
                            />

                            {canTogglePin(c) && (
                              <button
                                className="text-xs opacity-70 hover:opacity-100 inline-flex items-center gap-1"
                                onClick={() => togglePin(c)}
                                title={c.is_pinned ? 'Открепить' : 'Закрепить'}
                              >
                                <Pin className="w-3.5 h-3.5" />
                                {c.is_pinned ? 'Открепить' : 'Закрепить'}
                              </button>
                            )}

                            {canDeleteComment(c) && (
                              <button
                                className="text-xs text-red-500 opacity-80 hover:opacity-100 inline-flex items-center gap-1"
                                onClick={() => deleteComment(c)}
                                title="Удалить"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Удалить
                              </button>
                            )}
                          </div>
                        </header>

                        {hiddenNow ? (
                          <div className="mt-3 text-sm italic px-3 py-2 rounded bg-amber-500/10 border border-amber-400/30 text-amber-300">
                            Комментарий скрыт жалобами и ожидает решения модерации
                          </div>
                        ) : (
                          <div
                            className={`mt-3 text-sm leading-relaxed break-words ${bodyText}`}
                            dangerouslySetInnerHTML={{ __html: c.comment || '' }}
                          />
                        )}

                        {replies.length > 0 && (
                          <div className={cReply}>
                            <div className="space-y-3">
                              {replies.map((r) => {
                                const rIsTeam = r.is_team_comment && r.team_id != null;
                                const rTeam = rIsTeam ? teams.find((t) => t.id === Number(r.team_id)) : null;
                                const rName = rIsTeam ? rTeam?.name ?? 'Команда' : r.profile?.username ?? 'Пользователь';
                                const rAvatar = rIsTeam ? rTeam?.avatar_url ?? null : r.profile?.avatar_url ?? null;
                                const rInitials = (rIsTeam ? rTeam?.name?.[0] : r.profile?.username?.[0])?.toUpperCase() ?? '?';

                                const rHidden = Boolean(r.is_hidden) || Number(r.reports_count ?? 0) >= REPORTS_HIDE_THRESHOLD;

                                return (
                                  <div key={r.id} className="rounded-lg p-3 bg-black/5 dark:bg-white/5">
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`h-7 w-7 rounded-full overflow-hidden flex items-center justify-center text-[10px] ${
                                          theme === 'light' ? 'bg-gray-200 text-gray-700' : 'bg-gray-700 text-white'
                                        }`}
                                      >
                                        {rAvatar ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={rAvatar} alt="avatar" className="h-full w-full object-cover" />
                                        ) : (
                                          <span>{rInitials}</span>
                                        )}
                                      </div>

                                      <div className="text-xs font-medium">{rName}</div>
                                      <div className={`text-[11px] ${mutedText}`}>{new Date(r.created_at).toLocaleString('ru-RU')}</div>

                                      <div className="ml-auto flex items-center gap-2">
                                        {!rHidden && (
                                          <button
                                            className="text-[11px] opacity-70 hover:opacity-100 inline-flex items-center gap-1"
                                            onClick={() => setReplyTo({ id: r.id, username: r.profile?.username || undefined })}
                                          >
                                            <CornerDownRight className="w-3 h-3" />
                                            Ответить
                                          </button>
                                        )}

                                        {/* КНОПКА ЖАЛОБЫ (для ответа) */}
                                        <ReportForm
                                          mangaId={mid}
                                          commentId={r.id}
                                          onDone={(hidden) => {
                                            setComments(prev =>
                                              prev.map(x => {
                                                if (x.id !== r.id) return x;
                                                const newCount = Number(x.reports_count ?? 0) + 1;
                                                const shouldHide = hidden || newCount >= REPORTS_HIDE_THRESHOLD;
                                                return { ...x, reports_count: newCount, is_hidden: shouldHide ? true : x.is_hidden };
                                              })
                                            );
                                          }}
                                        />

                                        {canTogglePin(r) && (
                                          <button
                                            className="text-[11px] opacity-70 hover:opacity-100 inline-flex items-center gap-1"
                                            onClick={() => togglePin(r)}
                                            title={r.is_pinned ? 'Открепить' : 'Закрепить'}
                                          >
                                            <Pin className="w-3 h-3" />
                                            {r.is_pinned ? 'Открепить' : 'Закрепить'}
                                          </button>
                                        )}

                                        {canDeleteComment(r) && (
                                          <button
                                            className="text-[11px] text-red-500 opacity-80 hover:opacity-100 inline-flex items-center gap-1"
                                            onClick={() => deleteComment(r)}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                            Удалить
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {rHidden ? (
                                      <div className="mt-1 text-sm italic px-3 py-2 rounded bg-amber-500/10 border border-amber-400/30 text-amber-300">
                                        Комментарий скрыт жалобами
                                      </div>
                                    ) : (
                                      <div
                                        className={`mt-1 text-sm leading-relaxed ${bodyText}`}
                                        dangerouslySetInnerHTML={{ __html: r.comment || '' }}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
