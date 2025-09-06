// lib/manga/hooks.ts
// Переведено с Supabase на REST-эндпоинты (сервер → Neon).
// Универсальные React-хуки загрузки данных о тайтле.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type Manga = {
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

export type Chapter = {
  id: number;
  manga_id: number;
  chapter_number: number;
  title?: string | null;
  created_at: string;
};

export type Genre = { id: number | string; manga_id: number; genre: string };
export type Team = { id: number; name: string; slug?: string | null; avatar_url?: string | null; verified?: boolean | null };
export type RatingRow = { id: string; manga_id: number; rating: number };
export type CommentRow = {
  id: string;
  manga_id: number;
  user_id: string | null;
  comment: string; // HTML
  created_at: string;
  parent_id?: string | null;
  is_team_comment?: boolean | null;
  team_id?: number | null;
  is_pinned?: boolean | null;
  profile?: { id: string; username?: string | null; avatar_url?: string | null } | null;
  team?: { id: number; name: string; avatar_url?: string | null } | null;
};

type LoadState<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void };
type LoadListState<T> = { items: T[]; loading: boolean; error: string | null; reload: () => void };

function useFetchJson<T>(url: string | null, opts?: RequestInit): LoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);

  const fetchData = useCallback(async () => {
    if (!urlRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(urlRef.current, { cache: 'no-store', ...(opts || {}) });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || `HTTP ${res.status}`);
      // популярные формы ответа: {item}, {data}, напрямую объект
      const value = (js?.item ?? js?.data ?? js) as T;
      setData(value);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить данные');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [opts]);

  useEffect(() => {
    urlRef.current = url;
    if (url) void fetchData();
    else {
      setData(null);
      setLoading(false);
      setError(null);
    }
  }, [url, fetchData]);

  return { data, loading, error, reload: fetchData };
}

function useFetchList<T>(url: string | null, opts?: RequestInit): LoadListState<T> {
  const { data, loading, error, reload } = useFetchJson<{ items?: T[] }>(url, opts);
  const items = useMemo(() => (Array.isArray((data as any)?.items) ? (data as any).items as T[] : []), [data]);
  return { items, loading, error, reload };
}

/* === Точечные хуки === */

export function useManga(id: number | null | undefined) {
  const url = id ? `/api/manga/${id}` : null;
  return useFetchJson<Manga>(url);
}

export function useMangaChapters(id: number | null | undefined) {
  const url = id ? `/api/manga/${id}/chapters` : null;
  return useFetchList<Chapter>(url);
}

export function useMangaGenres(id: number | null | undefined) {
  const url = id ? `/api/manga/${id}/genres` : null;
  return useFetchList<Genre>(url);
}

export function useMangaTags(id: number | null | undefined) {
  const url = id ? `/api/manga/${id}/tags` : null;
  return useFetchList<string>(url);
}

export function useMangaTeams(id: number | null | undefined) {
  const url = id ? `/api/manga/${id}/teams` : null;
  return useFetchList<Team>(url);
}

export function useMangaRatings(id: number | null | undefined) {
  const url = id ? `/api/manga/${id}/ratings` : null;
  return useFetchList<RatingRow>(url);
}

export function useMangaComments(id: number | null | undefined) {
  const url = id ? `/api/manga/${id}/comments` : null;
  return useFetchList<CommentRow>(url);
}

/**
 * Композитный хук, загружающий всё сразу (удобно для страницы тайтла).
 * Возвращает готовые списки и состояния загрузки.
 */
export function useMangaFull(id: number | null | undefined) {
  const manga = useManga(id);
  const chapters = useMangaChapters(id);
  const genres = useMangaGenres(id);
  const tags = useMangaTags(id);
  const teams = useMangaTeams(id);
  const ratings = useMangaRatings(id);
  const comments = useMangaComments(id);

  const loading =
    manga.loading ||
    chapters.loading ||
    genres.loading ||
    tags.loading ||
    teams.loading ||
    ratings.loading ||
    comments.loading;

  const error =
    manga.error ||
    chapters.error ||
    genres.error ||
    tags.error ||
    teams.error ||
    ratings.error ||
    comments.error ||
    null;

  const reload = () => {
    manga.reload();
    chapters.reload();
    genres.reload();
    tags.reload();
    teams.reload();
    ratings.reload();
    comments.reload();
  };

  return {
    loading,
    error,
    manga: manga.data,
    chapters: chapters.items,
    genres: genres.items,
    tags: tags.items,
    teams: teams.items,
    ratings: ratings.items,
    comments: comments.items,
    reload,
  };
}
