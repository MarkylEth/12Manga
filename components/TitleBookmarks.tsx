// components/TitleBookmarks.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Clock, CheckCircle, Ban, Heart, Bookmark, ChevronDown, Info } from 'lucide-react';

export type LibStatus = 'planned' | 'reading' | 'completed' | 'dropped';

export interface TitleBookmarksProps {
  mangaId: number;
  className?: string;
  /** Принудительная тема, иначе возьмём из <html class="dark"> */
  theme?: 'dark' | 'light';
}

/* ======= локальная тема (без глобального контекста) ======= */
function resolveTheme(explicit?: 'dark' | 'light'): 'dark' | 'light' {
  if (explicit) return explicit;
  if (typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }
  return 'light';
}

type StatusOption = {
  value: LibStatus;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const STATUS_OPTIONS: StatusOption[] = [
  { value: 'reading', label: 'Читаю', Icon: BookOpen },
  { value: 'planned', label: 'В планах', Icon: Clock },
  { value: 'completed', label: 'Прочитано', Icon: CheckCircle },
  { value: 'dropped', label: 'Брошено', Icon: Ban },
];

type LibraryStats = { favorites?: number; reading?: number };
type LibraryEntry = { manga_id: number; status: LibStatus | null; favorite: boolean };

export default function TitleBookmarks({
  mangaId,
  className = '',
  theme: explicitTheme,
}: TitleBookmarksProps) {
  const [mounted, setMounted] = useState(false);
  const theme = useMemo(() => resolveTheme(explicitTheme), [explicitTheme]);

  // состояние
  const [status, setStatus] = useState<LibStatus | null>(null);
  const [fav, setFav] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null); // null до первого ответа

  const menuRef = useRef<HTMLDivElement | null>(null);

  // публичная агрегированная статистика
  const [publicStats, setPublicStats] = useState<LibraryStats | null>(null);

  // простой тост
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => setMounted(true), []);

  const baseBorder = theme === 'light' ? 'border-gray-300' : 'border-white/10';
  const baseBg =
    theme === 'light'
      ? 'bg-white hover:bg-gray-100 text-gray-800'
      : 'bg-gray-900/60 hover:bg-gray-800 text-white';
  const pill = (extra = '') =>
    `inline-flex items-center gap-2 rounded-xl border ${baseBorder} ${baseBg} px-3 py-2 text-sm ${extra}`;

  // закрытие меню по клику вне
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  // Загрузка публичной статистики
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const r = await fetch(`/api/manga/${mangaId}/library-stats`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!stop) setPublicStats(j?.stats ?? null);
      } catch {
        if (!stop) setPublicStats(null);
      }
    })();
    return () => {
      stop = true;
    };
  }, [mangaId]);

  // Загрузка личной записи
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const res = await fetch(`/api/manga/${mangaId}/library`, {
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (stop) return;

        if (res.status === 401) {
          setLoggedIn(false);
          return;
        }
        const j = await res.json().catch(() => ({}));
        const item: LibraryEntry | null = j?.item ?? null;
        setLoggedIn(true);
        if (item) {
          setStatus(item.status ?? null);
          setFav(Boolean(item.favorite));
        } else {
          setStatus(null);
          setFav(false);
        }
      } catch {
        if (!stop) setLoggedIn(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [mangaId]);

  // действия
  const requireAuth = () => {
    if (loggedIn) return true;
    showToast('Войдите, чтобы пользоваться закладками.');
    return false;
  };

  const refetchStats = async () => {
    try {
      const r = await fetch(`/api/manga/${mangaId}/library-stats`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      setPublicStats(j?.stats ?? null);
    } catch {}
  };

  const onToggleFav = async () => {
    if (!requireAuth() || saving) return;
    const next = !fav;
    setFav(next); // оптимистично
    setSaving(true);
    try {
      const res = await fetch(`/api/manga/${mangaId}/library`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: next }),
      });
      if (res.status === 401) {
        setFav(!next); // откат
        setLoggedIn(false);
        showToast('Войдите, чтобы добавлять в избранное.');
        return;
      }
      if (!res.ok) throw new Error();
      // Обновим публичные цифры
      await refetchStats();
    } catch {
      setFav(!next); // откат
      showToast('Не удалось обновить избранное.');
    } finally {
      setSaving(false);
    }
  };

  const onPickStatus = async (value: LibStatus) => {
    setMenuOpen(false);
    if (!requireAuth() || saving) return;
    const prev = status;
    setStatus(value); // оптимистично
    setSaving(true);
    try {
      const res = await fetch(`/api/manga/${mangaId}/library`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: value }),
      });
      if (res.status === 401) {
        setStatus(prev);
        setLoggedIn(false);
        showToast('Войдите, чтобы сохранять статус чтения.');
        return;
      }
      if (!res.ok) throw new Error();
      await refetchStats();
    } catch {
      setStatus(prev); // откат
      showToast('Не удалось обновить статус.');
    } finally {
      setSaving(false);
    }
  };

  const current = STATUS_OPTIONS.find((o) => o.value === status);
  const CurrentIcon = (current?.Icon ?? Bookmark) as any;

  // пока не смонтировались — отдаём «нейтральную» болванку
  if (!mounted) {
    return (
      <div className={['flex flex-col gap-2', className].join(' ')}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-28 rounded-xl border border-transparent bg-transparent" />
          <div className="h-9 w-28 rounded-xl border border-transparent bg-transparent" />
        </div>
        <div className="h-4 w-64 rounded bg-transparent" />
      </div>
    );
  }

  const favPillText = fav ? 'В избранном' : 'В избранное';

  return (
    <div className={['relative flex flex-col gap-2', className].filter(Boolean).join(' ')}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Выпадающий список статуса */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={pill(saving ? 'opacity-60 cursor-wait' : '')}
            disabled={saving}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <CurrentIcon className="h-4 w-4" />
            {current ? current.label : 'Мой статус'}
            <ChevronDown className="h-4 w-4 opacity-70" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className={`absolute z-10 mt-2 w-44 overflow-hidden rounded-xl border ${baseBorder} ${
                theme === 'light' ? 'bg-white' : 'bg-gray-900/95 backdrop-blur'
              }`}
            >
              {STATUS_OPTIONS.map(({ value, label, Icon }) => {
                const active = status === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onPickStatus(value)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      theme === 'light' ? 'hover:bg-gray-100' : 'hover:bg-white/10'
                    } ${active ? 'opacity-100' : 'opacity-90'}`}
                    role="menuitem"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                    {active && <span className="ml-auto text-xs opacity-70">текущий</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Избранное */}
        <button
          type="button"
          onClick={onToggleFav}
          className={pill(saving ? 'opacity-60 cursor-wait' : '')}
          disabled={saving}
          aria-pressed={fav}
        >
          <Heart className={`h-4 w-4 ${fav ? 'fill-red-500 text-red-500' : ''}`} />
          {favPillText}
        </button>

        {/* Публичная статистика (если есть) */}
        {publicStats && (
          <span
            className={`inline-flex items-center gap-2 rounded-xl border ${baseBorder} px-3 py-2 text-sm ${
              theme === 'light' ? 'bg-gray-50 text-gray-700' : 'bg-white/5 text-white'
            }`}
          >
            <Heart className="h-4 w-4" />
            {publicStats.favorites ?? 0}
            <span className="opacity-70">избранных</span>
          </span>
        )}
      </div>

      {/* Подсказка для неавторизованных */}
      {loggedIn === false && (
        <div className={`text-xs ${theme === 'light' ? 'text-gray-500' : 'text-slate-400'}`}>
          Войдите в аккаунт, чтобы сохранять «избранное» и статус чтения.
        </div>
      )}

      {/* Тост */}
      {toast && (
        <div
          className={`pointer-events-none absolute -bottom-10 left-0 flex items-center gap-2 rounded-lg px-3 py-2 text-sm shadow ${
            theme === 'light'
              ? 'bg-gray-900 text-white'
              : 'bg-white/90 text-gray-900'
          }`}
          role="status"
          aria-live="polite"
        >
          <Info className="h-4 w-4" />
          {toast}
        </div>
      )}
    </div>
  );
}
