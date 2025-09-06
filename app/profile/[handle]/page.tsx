'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

import { useTheme } from '@/lib/theme/context';
import { useAuth } from '@/lib/auth/context';
import { ThemeToggle } from '@/components/ThemeToggle';
import AuthModal from '@/components/auth/AuthModal';
import AddTitleModal from '@/components/AddTitleModal';

import {
  Star, Check, Plus, Ban, ExternalLink, MessageSquare, Calendar, BookOpen,
  Clock, TrendingUp, Activity, Heart, Eye, Grid3X3, User, Home, Shield, X, LogOut
} from 'lucide-react';

/* ================= helpers для работы с NEON API ================= */

async function tryJson(urls: string[], init?: RequestInit) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { ...init, credentials: 'include', cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
}

async function tryOk(urls: string[], init?: RequestInit) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { ...init, credentials: 'include' });
      if (res.ok) return true;
    } catch {}
  }
  return false;
}

/* ================= типы UI ================= */

type CardItem = {
  manga_id: number;
  title: string | null;
  cover_url: string | null;
  lang: string | null;
};

type ActivityItem = {
  type: 'read' | 'completed' | 'favorited' | 'planned' | 'dropped';
  manga_id: number;
  manga_title: string;
  manga_cover: string | null;
  date: string;
};

type LibraryRow = {
  status: 'reading' | 'completed' | 'planned' | 'dropped' | null;
  is_favorite: boolean | null;
  manga_id: number;
  updated_at?: string | null;
  created_at?: string | null;
};

type ProfileLite = {
  id: string;            // UUID
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string | null;
  banner_url: string | null;
  favorite_genres: string[] | null;
  telegram: string | null;
  x_url: string | null;
  vk_url: string | null;
  discord_url: string | null;
};

/* ==================== Модалка редактирования ==================== */

const GENRES_FALLBACK = [
  'Арт','Безумие','Боевик','Боевые искусства','Вампиры','Военное','Гарем','Гендерная интрига',
  'Героическое фэнтези','Демоны','Детектив','Дзёсэй','Драма','Игра','Исекай','История','Киберпанк',
  'Кодомо','Комедия','Космос','Магия','Махо-сёдзё','Машины','Меха','Мистика','Музыка',
  'Научная фантастика','Омегаверс','Пародия','Повседневность','Полиция','Постапокалиптика',
  'Приключения','Психология','Романтика','Самурайский боевик','Сверхъестественное',
  'Сёдзё','Сёнен','Спорт','Супер сила','Сэйнэн','Трагедия','Триллер','Ужасы',
  'Фантастика','Фэнтези','Школа','Эротика','Этти',
];

type EditValues = {
  username: string;
  full_name: string;
  avatar_url: string;
  bio: string;
  banner_url: string;
  favorite_genres: string[];
  telegram: string;
  x_url: string;
  vk_url: string;
  discord_url: string;
};

function EditProfileModal({
  open, onClose, initial, onSaved, theme, profileId,
}: {
  open: boolean;
  onClose: () => void;
  initial: EditValues;
  onSaved: (v: EditValues) => void;
  theme: 'light' | 'dark';
  profileId: string;
}) {
  const [v, setV] = useState<EditValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allGenres, setAllGenres] = useState<string[]>(GENRES_FALLBACK);
  const [enabled, setEnabled] = useState({
    telegram: !!initial.telegram,
    x_url: !!initial.x_url,
    vk_url: !!initial.vk_url,
    discord_url: !!initial.discord_url,
  });

  // состояние валидации username
  const [uTouched, setUTouched] = useState(false);
  const [uStatus, setUStatus] = useState<'idle'|'checking'|'free'|'taken'>('idle');
  const [uErr, setUErr] = useState<string | null>(null);

  // валидный ник: a–z, 0–9, "_" ; длина 3–20
  const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
  const usernameInvalid = !!v.username && !USERNAME_RE.test(v.username);
  const disableSave = saving || usernameInvalid || uStatus === 'checking' || uStatus === 'taken' || !!uErr;

  useEffect(() => {
    if (!open) return;
    setUTouched(false);
    setUStatus('idle');
    setUErr(null);
    setV(initial);
    setError(null);
    setEnabled({
      telegram: !!initial.telegram,
      x_url: !!initial.x_url,
      vk_url: !!initial.vk_url,
      discord_url: !!initial.discord_url,
    });
  }, [open, initial]);

  useEffect(() => {
    if (!uTouched) return;

    const u = v.username.trim();
    if (!u) { setUStatus('idle'); setUErr(null); return; }

    if (!USERNAME_RE.test(u)) {
      setUStatus('idle');
      setUErr('Только a–z, 0–9, "_" ; длина 3–20.');
      return;
    }

    setUErr(null);
    setUStatus('checking');

    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/profile/check-username?u=${encodeURIComponent(u)}&self=${encodeURIComponent(String(profileId || ''))}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Ошибка проверки');
        setUStatus(json.available ? 'free' : 'taken');
      } catch {
        setUStatus('idle');
        setUErr('Не удалось проверить ник');
      }
    }, 350);

    return () => clearTimeout(t);
  }, [uTouched, v.username, profileId]);

  useEffect(() => {
    let mounted = true;
    tryJson(['/api/genres', '/api/manga/genres'])
      .then((data) => {
        if (!mounted || !Array.isArray(data)) return;
        const list = data.map((g: any) => g?.name).filter(Boolean);
        if (list.length) setAllGenres(list);
      })
      .catch(() => void 0);
    return () => { mounted = false; };
  }, []);

  const card = theme === 'light' ? 'bg-white border border-gray-200' : 'bg-slate-800 border border-slate-700';
  const input = theme === 'light'
    ? 'bg-white border-gray-300 focus:ring-blue-100'
    : 'bg-slate-700 border-slate-600 focus:ring-blue-500';
  const text = theme === 'light' ? 'text-gray-900' : 'text-white';
  const muted = theme === 'light' ? 'text-gray-500' : 'text-slate-400';

  const SocialRow = ({
    label, placeholder, field,
  }: { label: string; placeholder: string; field: keyof EditValues }) => {
    const on = (enabled as any)[field] as boolean;
    return (
      <div className="group relative flex items-center gap-6 p-4 rounded-2xl border border-gray-200/60 dark:border-slate-700/60 bg-gradient-to-r from-gray-50/50 to-white/50 dark:from-slate-800/50 dark:to-slate-700/50 hover:shadow-md transition-all duration-300">
        <div className={`w-20 text-sm font-bold tracking-wider uppercase ${text} opacity-70`}>
          {label}
        </div>
        <div className="flex-1 relative">
          <input
            className={`w-full rounded-xl border-2 px-4 py-3.5 outline-none transition-all duration-200 ${
              on 
                ? 'border-gray-200 dark:border-slate-600 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30' 
                : 'border-gray-100 dark:border-slate-700'
            } ${input} ${text} ${
              !on ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-slate-800/50' : 'hover:border-gray-300 dark:hover:border-slate-500'
            }`}
            placeholder={placeholder}
            value={(v as any)[field] ?? ''}
            onChange={(e) => setV((p) => ({ ...p, [field]: e.target.value }))}
            disabled={!on}
            inputMode="url"
            autoComplete="off"
          />
          {on && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>
        <div className="flex items-center">
          <label className="relative inline-flex items-center cursor-pointer group">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={on}
              onChange={(e) => {
                const checked = e.target.checked;
                setEnabled((p) => ({ ...(p as any), [field]: checked }));
                if (!checked) setV((p) => ({ ...p, [field]: '' as any }));
              }}
            />
            <div className="w-14 h-7 bg-gradient-to-r from-gray-200 to-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/50 dark:peer-focus:ring-blue-800/50 rounded-full peer dark:bg-gradient-to-r dark:from-gray-600 dark:to-gray-700 peer-checked:after:translate-x-7 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border-2 after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-md dark:border-gray-600 peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-blue-600 hover:shadow-lg transition-all duration-200"></div>
          </label>
        </div>
      </div>
    );
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        id: profileId,
        username: v.username.trim(),
        full_name: v.full_name.trim() || null,
        avatar_url: v.avatar_url.trim() || null,
        bio: v.bio.trim() || null,
        banner_url: v.banner_url.trim() || null,
        favorite_genres: Array.isArray(v.favorite_genres) ? v.favorite_genres : [],
        telegram: v.telegram.trim() || null,
        x_url: v.x_url.trim() || null,
        vk_url: v.vk_url.trim() || null,
        discord_url: v.discord_url.trim() || null,
      };
      const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
      const uname = v.username.trim();
      if (!USERNAME_RE.test(uname)) throw new Error('Имя пользователя: только a–z, 0–9, "_" и длина 3–20.');
      if (uStatus === 'taken') throw new Error('Имя пользователя занято.');

      const ok = await tryOk(
        ['/api/profile/update'],
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      if (!ok) throw new Error('Не удалось сохранить профиль');

      onSaved({
        username: payload.username ?? '',
        full_name: payload.full_name ?? '',
        avatar_url: payload.avatar_url ?? '',
        bio: payload.bio ?? '',
        banner_url: payload.banner_url ?? '',
        favorite_genres: payload.favorite_genres ?? [],
        telegram: payload.telegram ?? '',
        x_url: payload.x_url ?? '',
        vk_url: payload.vk_url ?? '',
        discord_url: payload.discord_url ?? '',
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4"
        >
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.95 }} 
            animate={{ y: 0, opacity: 1, scale: 1 }} 
            exit={{ y: 20, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`relative w-screen h-screen sm:h-auto sm:w-[min(760px,95vw)] rounded-none sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col ${card} ring-1 ring-black/5 dark:ring-white/10`}
          >
            {/* Заголовок с градиентом */}
            <div className={`relative sticky top-0 z-10 flex items-center justify-between px-6 py-5 border-b backdrop-blur-sm ${
              theme === 'light' 
                ? 'bg-gradient-to-r from-white via-white to-gray-50/80 border-gray-200/80' 
                : 'bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700/80 border-slate-600/80'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div className={`text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent`}>
                  Редактировать профиль
                </div>
              </div>
              <button
                disabled={saving}
                onClick={onClose}
                type="button"
                className={`p-2.5 rounded-xl transition-all duration-200 ${
                  theme === 'light' 
                    ? 'hover:bg-gray-100 text-gray-400 hover:text-gray-600' 
                    : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                } hover:scale-105`}
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form id="editProfileForm" onSubmit={onSubmit} className="px-6 py-6 space-y-8 overflow-y-auto max-h-[calc(100vh-140px)] sm:max-h-[75vh] custom-scrollbar">
            
              {/* Секция аватара с улучшенным дизайном */}
              <div className="relative p-6 rounded-3xl bg-gradient-to-br from-blue-50/50 via-white to-purple-50/30 dark:from-slate-800/50 dark:via-slate-700/30 dark:to-slate-800/50 border border-blue-100/50 dark:border-slate-600/50">
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <div className="h-20 w-20 rounded-2xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-600 dark:to-slate-700 shrink-0 ring-4 ring-white dark:ring-slate-800 shadow-lg">
                      {v.avatar_url ? (
                        <img src={v.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-2xl">👤</div>
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className={`block text-xs uppercase font-bold tracking-wider ${muted} mb-3`}>
                      Ссылка на аватар
                    </label>
                    <input
                      className={`w-full rounded-xl border-2 px-4 py-3 outline-none focus:ring-4 transition-all duration-200 ${input} ${text} border-gray-200 dark:border-slate-600 focus:border-blue-400 focus:ring-blue-100 dark:focus:ring-blue-900/30`}
                      placeholder="https://example.com/avatar.jpg"
                      value={v.avatar_url}
                      onChange={(e) => setV((p) => ({ ...p, avatar_url: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Баннер */}
              <div className="space-y-4">
                <label className={`block text-xs uppercase font-bold tracking-wider ${muted}`}>
                  Баннер профиля
                </label>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-36 rounded-xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-600 dark:to-slate-700 shadow-inner ring-2 ring-gray-200 dark:ring-slate-600">
                    {v.banner_url ? (
                      <img src={v.banner_url} alt="banner" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-slate-400">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <input
                    className={`flex-1 rounded-xl border-2 px-4 py-3 outline-none focus:ring-4 transition-all duration-200 ${input} ${text} border-gray-200 dark:border-slate-600 focus:border-blue-400 focus:ring-blue-100 dark:focus:ring-blue-900/30`}
                    placeholder="https://example.com/banner.jpg"
                    value={v.banner_url}
                    onChange={(e) => setV((p) => ({ ...p, banner_url: e.target.value }))}
                  />
                </div>
              </div>

              {/* Имя пользователя */}
              <div className="space-y-3">
                <label className={`block text-xs uppercase font-bold tracking-wider ${muted}`}>
                  Имя пользователя
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">@</span>
                  <input
                    className={`w-full rounded-xl border-2 pl-8 pr-4 py-3.5 outline-none focus:ring-4 transition-all duration-200 ${input} ${text} border-gray-200 dark:border-slate-600 focus:border-blue-400 focus:ring-blue-100 dark:focus:ring-blue-900/30`}
                    value={v.username}
                    onChange={(e) => {
                      const raw = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                      if (raw.length <= 20) {
                        setV((p) => ({ ...p, username: raw }));
                        setUTouched(true);
                      }
                    }}
                    onBlur={() => setUTouched(true)}
                    placeholder="kiosoki"
                  />
                  {uStatus === 'free' && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                  uErr ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                  : uStatus === 'taken' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                  : uStatus === 'free' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-400'
                }`}>
                  {uErr
                    ? <>❌ {uErr}</>
                    : uStatus === 'checking'
                      ? <>⏳ Проверяем…</>
                      : uStatus === 'taken'
                        ? <>❌ Имя занято</>
                        : uStatus === 'free'
                          ? <>✅ Имя свободно</>
                          : <>💡 Допустимы: a–z, 0–9, «_», 3–20 символов.</>}
                </div>
              </div>

              {/* Имя */}
              <div className="space-y-3">
                <label className={`block text-xs uppercase font-bold tracking-wider ${muted}`}>
                  Полное имя
                </label>
                <input
                  className={`w-full rounded-xl border-2 px-4 py-3.5 outline-none focus:ring-4 transition-all duration-200 ${input} ${text} border-gray-200 dark:border-slate-600 focus:border-blue-400 focus:ring-blue-100 dark:focus:ring-blue-900/30`}
                  value={v.full_name}
                  onChange={(e) => setV((p) => ({ ...p, full_name: e.target.value }))}
                  placeholder="Как вас зовут"
                />
              </div>

              {/* О себе */}
              <div className="space-y-3">
                <label className={`block text-xs uppercase font-bold tracking-wider ${muted}`}>
                  О себе
                </label>
                <div className="relative">
                  <textarea
                    className={`w-full h-32 resize-y rounded-xl border-2 px-4 py-3.5 outline-none focus:ring-4 transition-all duration-200 ${input} ${text} border-gray-200 dark:border-slate-600 focus:border-blue-400 focus:ring-blue-100 dark:focus:ring-blue-900/30`}
                    maxLength={300}
                    value={v.bio}
                    onChange={(e) => setV((p) => ({ ...p, bio: e.target.value }))}
                    placeholder="Расскажите немного о себе..."
                  />
                  <div className={`absolute bottom-3 right-3 text-xs px-2 py-1 rounded-md ${
                    v.bio.length > 250 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                    v.bio.length > 200 ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {v.bio.length}/300
                  </div>
                </div>
              </div>

              {/* Жанры */}
              <div className="space-y-4">
                <label className={`block text-xs uppercase font-bold tracking-wider ${muted}`}>
                  Любимые жанры (до 13)
                </label>
                <div className="p-4 rounded-2xl bg-gray-50/50 dark:bg-slate-800/30 border border-gray-200/50 dark:border-slate-700/50">
                  <div className="flex flex-wrap gap-2.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {allGenres.map((g) => {
                      const on = v.favorite_genres.includes(g);
                      const disabled = !on && v.favorite_genres.length >= 13;
                      return (
                        <button
                          type="button"
                          key={g}
                          disabled={disabled}
                          onClick={() =>
                            setV((p) => ({
                              ...p,
                              favorite_genres: on ? p.favorite_genres.filter((x) => x !== g) : [...p.favorite_genres, g],
                            }))
                          }
                          className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all duration-200 transform hover:scale-105 ${
                            on
                              ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white border-transparent shadow-lg'
                              : disabled 
                                ? 'opacity-30 cursor-not-allowed bg-gray-100 dark:bg-slate-700 text-gray-400 border-gray-200 dark:border-slate-600'
                                : `hover:shadow-md border-gray-200 dark:border-slate-600 ${
                                    theme === 'light' 
                                      ? 'bg-white text-gray-700 hover:bg-gray-50' 
                                      : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                                  }`
                          }`}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 text-xs text-center text-gray-500 dark:text-slate-400">
                    Выбрано: {v.favorite_genres.length}/13
                  </div>
                </div>
              </div>

              {/* Соцсети */}
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <label className={`text-sm font-bold tracking-wider uppercase ${text}`}>
                    Социальные сети
                  </label>
                </div>
                
                <div className="space-y-4">
                  <SocialRow label="TELEGRAM" placeholder="https://t.me/username" field="telegram" />
                  <SocialRow label="X" placeholder="https://x.com/username" field="x_url" />
                  <SocialRow label="VK" placeholder="https://vk.com/username" field="vk_url" />
                  <SocialRow label="DISCORD" placeholder="https://discord.gg/invite" field="discord_url" />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-xl border-l-4 ${
                    theme === 'light' 
                      ? 'bg-red-50 text-red-700 border-red-400' 
                      : 'bg-red-900/20 text-red-300 border-red-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    {error}
                  </div>
                </motion.div>
              )}
            </form>

            {/* Кнопки действий */}
            <div
              className={`sticky bottom-0 z-10 flex justify-end gap-3 px-6 py-5 border-t backdrop-blur-sm ${
                theme === 'light'
                  ? 'bg-white/90 border-gray-200/80'
                  : 'bg-slate-800/90 border-slate-600/80'
              }`}
            >
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  theme === 'light'
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-md'
                    : 'bg-slate-700 text-slate-200 hover:bg-slate-600 hover:shadow-md'
                } transform hover:scale-105`}
              >
                Отмена
              </button>

              <button
                type="submit"
                form="editProfileForm"  // ← добавили привязку к форме
                disabled={disableSave}
                className={`px-8 py-3 rounded-xl text-sm font-semibold transition-all duration-200 transform hover:scale-105 ${
                  disableSave
                    ? 'opacity-50 cursor-not-allowed bg-gray-400 text-white'
                    : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {saving ? (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2v6m0 8v6m6-12h-6m-8 0h6" />
                    </svg>
                    Сохранение…
                  </div>
                ) : (
                  'Сохранить'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ==================== Header (локальный для страницы профиля) ==================== */

const ProfileHeader = ({
  authModalOpen, setAuthModalOpen, authModalMode, setAuthModalMode,
  addTitleModalOpen, setAddTitleModalOpen,
  showUserMenu, setShowUserMenu,
}: {
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  authModalMode: 'login' | 'register';
  setAuthModalMode: (mode: 'login' | 'register') => void;
  addTitleModalOpen: boolean;
  setAddTitleModalOpen: (open: boolean) => void;
  showUserMenu: boolean;
  setShowUserMenu: (show: boolean) => void;
}) => {
  const auth = useAuth() as { user?: any; profile?: any; loading?: boolean };
  const user = auth?.user;
  const profile = auth?.profile;
  const loading = auth?.loading ?? false;
  const { theme } = useTheme();

  // простая проверка на админа
  const isAdmin = Boolean(profile?.role === 'admin' || user?.role === 'admin');

  const openAuthModal = (mode: 'login' | 'register') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  useEffect(() => {
    const handleClickOutside = () => setShowUserMenu(false);
    if (showUserMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showUserMenu, setShowUserMenu]);

  useEffect(() => {
    if (!showUserMenu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowUserMenu(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showUserMenu, setShowUserMenu]);

  const textClass = theme === 'light' ? 'text-gray-900' : 'text-white';

  const ThemedLogo = ({ className = '' }: { className?: string }) => {
    const src = theme === 'light' ? '/logo.png' : '/logodark.png';
    return (
      <motion.div
        className={`origin-left inline-block select-none ${className}`}
        initial={{ rotate: 0 }}
        whileHover={{ rotate: -6 }}
        whileTap={{ rotate: -8, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      >
        <Image src={src} alt="MangaPulse" width={500} height={500} priority className="w-auto h-5 sm:h-5 md:h-8" />
      </motion.div>
    );
  };

  // свой ник/ссылка на профиль и logout
  const myProfileHref = profile?.username
    ? `/profile/${encodeURIComponent(profile.username)}`
    : '/profile';

  async function handleLogout() {
    setShowUserMenu(false);
    const tryPost = async (url: string) => {
      try { await fetch(url, { method: 'POST', credentials: 'include' }); } catch {}
    };
    // поддерживаем оба возможных роута
    await tryPost('/api/auth/signout');
    await tryPost('/api/logout');
    window.location.href = '/';
  }

  return (
    <>
      <header className={`backdrop-blur-sm border-b sticky top-0 z-50 ${theme === 'light' ? 'bg-white/90 border-gray-200' : 'bg-slate-800/50 border-slate-700'}`}>
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center" aria-label="На главную">
                <ThemedLogo />
              </Link>
            </div>

            <div className="flex-1 flex items-center justify-center gap-4">
              <Link href="/">
                <motion.button
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors ${theme === 'light' ? 'text-gray-600 hover:text-gray-900' : 'text-slate-300 hover:text-white'}`}
                >
                  <Home className="w-4 h-4" />
                  <span className="hidden sm:block">Главная</span>
                </motion.button>
              </Link>
              <Link href="/catalog">
                <motion.button
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors ${theme === 'light' ? 'text-gray-600 hover:text-gray-900' : 'text-slate-300 hover:text-white'}`}
                >
                  <Grid3X3 className="w-4 h-4" />
                  <span className="hidden sm:block">Каталог</span>
                </motion.button>
              </Link>
              {isAdmin && (
                <Link href="/admin">
                  <motion.button
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    <span className="hidden sm:block">Админ</span>
                  </motion.button>
                </Link>
              )}
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              {user && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setAddTitleModalOpen(true)}
                  className="p-1.5 rounded-lg bg-green-600 hover:bg-green-700 transition-colors"
                  title="Предложить мангу"
                >
                  <Plus className="w-4 h-4 text-white" />
                </motion.button>
              )}

              {user ? (
                <div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors ${theme === 'light' ? 'bg-gray-100 hover:bg-gray-200' : 'bg-slate-700 hover:bg-slate-600'}`}
                  >
                    {profile?.avatar_url ? (
                      <Image src={profile.avatar_url} alt="Avatar" width={22} height={22} className="rounded-full object-cover" />
                    ) : (
                      <User className={`w-4 h-4 ${textClass}`} />
                    )}
                    <span className={`text-sm hidden sm:block ${textClass}`}>{profile?.username || 'Профиль'}</span>
                  </motion.button>

                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                      className={`absolute right-0 mt-2 w-48 rounded-lg border shadow-lg z-50 ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-slate-800 border-slate-700'}`}
                    >
                      <div className="py-2">
                        <Link
                          href={myProfileHref}
                          onClick={() => setShowUserMenu(false)}
                          className={`block px-4 py-2 text-sm transition-colors ${theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-700'}`}
                        >
                          Мой профиль
                        </Link>

                        {isAdmin && (
                          <Link href="/admin" onClick={() => setShowUserMenu(false)} className={`block px-4 py-2 text-sm transition-colors ${theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-700'}`}>
                            Админ панель
                          </Link>
                        )}

                        <button
                          onClick={handleLogout}
                          className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-700'}`}
                        >
                          <LogOut className="w-4 h-4" />
                          Выйти с аккаунта
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              ) : (
                !loading && (
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => openAuthModal('login')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white text-sm font-medium"
                    >
                      Войти
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => openAuthModal('register')}
                      className={`px-3 py-1.5 rounded-lg transition-colors text-sm font-medium ${theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                    >
                      Регистрация
                    </motion.button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} initialMode={authModalMode} />
      {/* ProfileModal — удалён */}
    </>
  );
};

/* ==================== Сама страница ==================== */

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { theme } = useTheme();
  const mode: 'light' | 'dark' = theme === 'light' ? 'light' : 'dark';
  const textClass = mode === 'light' ? 'text-gray-900' : 'text-white';

  const auth = useAuth() as { user?: any };
  const user = auth?.user;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const canEdit = !!(user && profile && user.id === profile.id);
  const router = useRouter();

  const [reading, setReading] = useState<CardItem[]>([]);
  const [completed, setCompleted] = useState<CardItem[]>([]);
  const [favorites, setFavorites] = useState<CardItem[]>([]);
  const [planned, setPlanned] = useState<CardItem[]>([]);
  const [dropped, setDropped] = useState<CardItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [addTitleModalOpen, setAddTitleModalOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [dmLoading, setDmLoading] = useState(false);

  const initialEditValues = useMemo(() => ({
    username: profile?.username ?? '',
    full_name: profile?.full_name ?? '',
    avatar_url: profile?.avatar_url ?? '',
    bio: profile?.bio ?? '',
    banner_url: profile?.banner_url ?? '',
    favorite_genres: profile?.favorite_genres ?? [],
    telegram: profile?.telegram ?? '',
    x_url: profile?.x_url ?? '',
    vk_url: profile?.vk_url ?? '',
    discord_url: profile?.discord_url ?? '',
  }), [profile]);

  const tabs = [
    { key: 'reading', title: 'Читаю', count: reading.length },
    { key: 'completed', title: 'Прочитано', count: completed.length },
    { key: 'dropped', title: 'Брошено', count: dropped.length },
    { key: 'favorites', title: 'Любимое', count: favorites.length },
    { key: 'planned', title: 'В планах', count: planned.length },
  ] as const;
  const [active, setActive] = useState<(typeof tabs)[number]['key']>('reading');

  const palette = {
    card: theme === 'light' ? 'bg-white border border-gray-200 shadow-sm' : 'bg-slate-800/60 border border-slate-700 shadow-sm',
    muted: theme === 'light' ? 'text-gray-500' : 'text-slate-400',
    divider: theme === 'light' ? 'border-gray-200' : 'border-slate-700',
    text: theme === 'light' ? 'text-gray-900' : 'text-white',
    textSecondary: theme === 'light' ? 'text-gray-700' : 'text-gray-200',
  };

  const cardBgClass = theme === 'light' ? 'bg-white border-gray-200' : 'bg-slate-800/60 backdrop-blur-sm border-slate-700';

  const stats = useMemo(() => {
    const favoriteGenres = profile?.favorite_genres?.length ? profile.favorite_genres : ['Сёнэн', 'Романтика', 'Фантастика'];
    const joinDate = profile?.created_at ? String(new Date(profile.created_at).getFullYear()) : '';
    return {
      thisWeekActivity: recentActivity.length,
      favoriteGenres,
      joinDate,
      readingStreak: Math.floor(Math.random() * 15) + 1,
    };
  }, [recentActivity, profile]);

  // Загрузка профиля + библиотеки (NEON REST)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);

      const prof = await tryJson([
        `/api/profile/by-username?u=${encodeURIComponent(handle)}`,
        `/api/profile/${encodeURIComponent(handle)}`,
        `/api/profile/${encodeURIComponent(handle)}`,
        `/api/profile/by-username?u=${encodeURIComponent(handle)}`,
        `/api/users/${encodeURIComponent(handle)}`,
      ]);

      if (!alive) return;

      if (!prof) {
        setProfile(null);
        setReading([]); setCompleted([]); setFavorites([]); setPlanned([]); setDropped([]);
        setRecentActivity([]);
        setLoading(false);
        return;
      }

      const normalized: ProfileLite = {
        id: String(prof.id),
        username: prof.username || handle,
        full_name: prof.full_name ?? null,
        avatar_url: prof.avatar_url ?? null,
        bio: prof.bio ?? null,
        created_at: prof.created_at ?? null,
        banner_url: prof.banner_url ?? null,
        favorite_genres: Array.isArray(prof.favorite_genres) ? prof.favorite_genres : null,
        telegram: prof.telegram ?? null,
        x_url: prof.x_url ?? null,
        vk_url: prof.vk_url ?? null,
        discord_url: prof.discord_url ?? null,
      };
      setProfile(normalized);

      // --- библиотека ---
      const libRes = await tryJson([
        `/api/user-library?user_id=${encodeURIComponent(normalized.id)}`,
        `/api/library?user_id=${encodeURIComponent(normalized.id)}`
      ]);

      const rows: LibraryRow[] = Array.isArray(libRes)
        ? libRes
        : Array.isArray((libRes as any)?.data)
          ? (libRes as any).data
          : [];

      if (!rows.length) {
        setReading([]); setCompleted([]); setFavorites([]); setPlanned([]); setDropped([]);
        setRecentActivity([]);
        setLoading(false);
        return;
      }

      const ids = [...new Set(rows.map(r => r.manga_id).filter(Boolean))];

      // --- тайтлы ---
      let mangasList: Array<{ id:number; title:string|null; cover_url:string|null }> = [];
      if (ids.length) {
        const mangasRes = await tryJson([
          `/api/manga/batch?ids=${ids.join(',')}`,
          `/api/manga?ids=${ids.join(',')}`,
        ]);

        const raw = Array.isArray(mangasRes)
          ? mangasRes
          : Array.isArray((mangasRes as any)?.data)
            ? (mangasRes as any).data
            : [];

        mangasList = raw.map((m: any) => ({
          id: Number(m.id),
          title: m.title ?? null,
          cover_url: m.cover_url ?? null,
        }));
      }

      const byId = new Map<number, { id:number; title:string|null; cover_url:string|null }>(
        mangasList.map((m) => [m.id, m])
      );

      const toItem = (r: any): CardItem | null => {
        const m = byId.get(r.manga_id);
        if (!m) return null;
        return { manga_id: m.id, title: m.title, cover_url: m.cover_url, lang: 'ru' };
      };

      const rd = rows.filter(r => r.status === 'reading').map(toItem).filter(Boolean) as CardItem[];
      const cm = rows.filter(r => r.status === 'completed').map(toItem).filter(Boolean) as CardItem[];
      const pl = rows.filter(r => r.status === 'planned').map(toItem).filter(Boolean) as CardItem[];
      const dr = rows.filter(r => r.status === 'dropped').map(toItem).filter(Boolean) as CardItem[];
      const fv = rows.filter(r => !!r.is_favorite).map(toItem).filter(Boolean) as CardItem[];

      setReading(rd); setCompleted(cm); setPlanned(pl); setDropped(dr); setFavorites(fv);

      setRecentActivity(
        rows.slice(0, 5).map(r => ({
          type: r.status === 'completed' ? 'completed'
              : r.status === 'planned'   ? 'planned'
              : r.status === 'dropped'   ? 'dropped'
              : 'read',
          manga_id: r.manga_id,
          manga_title: byId.get(r.manga_id)?.title ?? 'Без названия',
          manga_cover: byId.get(r.manga_id)?.cover_url ?? null,
          date: (r as any).updated_at || (r as any).created_at || new Date().toISOString()
        }))
      );

      setLoading(false);
    })();

    return () => { alive = false; };
  }, [handle]);

  // ====== helpers ======
  const isFavorite = useCallback((manga_id: number) => favorites.some((f) => f.manga_id === manga_id), [favorites]);
  const isPlanned  = useCallback((manga_id: number) => planned.some((p) => p.manga_id === manga_id), [planned]);
  const isDropped  = useCallback((manga_id: number) => dropped.some((d) => d.manga_id === manga_id), [dropped]);

  const upsertLibrary = async (item: CardItem, patch: Partial<{ status: LibraryRow['status']; is_favorite: boolean }>) => {
    if (!user || !canEdit) return;
    await tryOk(
      ['/api/user-library', '/api/library'],
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manga_id: item.manga_id, ...patch }),
      }
    );
  };

  const toggleFavorite = async (item: CardItem) => {
    if (!user || !canEdit) return;
    const on = isFavorite(item.manga_id);
    setFavorites((prev) => (on ? prev.filter((x) => x.manga_id !== item.manga_id) : [item, ...prev]));
    try { await upsertLibrary(item, { is_favorite: !on }); } catch {}
  };

  const markCompleted = async (item: CardItem) => {
    if (!user || !canEdit) return;
    setReading((p) => p.filter((x) => x.manga_id !== item.manga_id));
    setPlanned((p) => p.filter((x) => x.manga_id !== item.manga_id));
    setDropped((p) => p.filter((x) => x.manga_id !== item.manga_id));
    setCompleted((p) => [item, ...p]);
    try { await upsertLibrary(item, { status: 'completed' }); } catch {}
  };

  const toggleList = async (item: CardItem, status: 'planned' | 'dropped') => {
    if (!user || !canEdit) return;
    const on = status === 'planned' ? isPlanned(item.manga_id) : isDropped(item.manga_id);
    const newStatus: LibraryRow['status'] = on ? 'reading' : status;

    if (status === 'planned') {
      setPlanned((p) => (on ? p.filter((x) => x.manga_id !== item.manga_id) : [item, ...p]));
      setDropped((p) => p.filter((x) => x.manga_id !== item.manga_id));
      setCompleted((p) => p.filter((x) => x.manga_id !== item.manga_id));
    } else {
      setDropped((p) => (on ? p.filter((x) => x.manga_id !== item.manga_id) : [item, ...p]));
      setPlanned((p) => p.filter((x) => x.manga_id !== item.manga_id));
      setCompleted((p) => p.filter((x) => x.manga_id !== item.manga_id));
    }

    try { await upsertLibrary(item, { status: newStatus }); } catch {}
  };

  // ====== старт ЛС (DM) ======
  const startDM = async () => {
    if (!profile) return;
    if (!user) {
      setAuthModalMode('login');
      setAuthModalOpen(true);
      return;
    }
    if (user.id === profile.id) return; // сам себе не пишем

    try {
      setDmLoading(true);
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'dm', userId: profile.id }), // UUID
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok || !json?.chatId) throw new Error(json?.message || 'Не удалось открыть чат');
      router.push(`/messages/${json.chatId}`);
    } catch (e) {
      alert((e as Error).message || 'Не удалось открыть чат');
    } finally {
      setDmLoading(false);
    }
  };

  const visible = useMemo<CardItem[]>(() => {
    switch (active) {
      case 'reading': return reading;
      case 'completed': return completed;
      case 'favorites': return favorites;
      case 'planned': return planned;
      case 'dropped': return dropped;
      default: return [];
    }
  }, [active, reading, completed, favorites, planned, dropped]);

  // ====== оформление страницы ======
  const pageBg = mode === 'light'
    ? 'bg-gray-50'
    : 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950';

  if (loading) {
    return (
      <div className={`min-h-screen ${pageBg}`}>
        <ProfileHeader
          authModalOpen={authModalOpen} setAuthModalOpen={setAuthModalOpen}
          authModalMode={authModalMode} setAuthModalMode={setAuthModalMode}
          addTitleModalOpen={addTitleModalOpen} setAddTitleModalOpen={setAddTitleModalOpen}
          showUserMenu={showUserMenu} setShowUserMenu={setShowUserMenu}
        />
        <div className={`max-w-7xl mx-auto p-4 ${mode === 'light' ? 'text-gray-600' : 'text-slate-300'}`}>Загрузка…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={`min-h-screen ${pageBg}`}>
        <ProfileHeader
          authModalOpen={authModalOpen} setAuthModalOpen={setAuthModalOpen}
          authModalMode={authModalMode} setAuthModalMode={setAuthModalMode}
          addTitleModalOpen={addTitleModalOpen} setAddTitleModalOpen={setAddTitleModalOpen}
          showUserMenu={showUserMenu} setShowUserMenu={setShowUserMenu}
        />
        <div className={`max-w-7xl mx-auto p-4 ${textClass}`}>Профиль не найден</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${pageBg}`}>
      <ProfileHeader
        authModalOpen={authModalOpen} setAuthModalOpen={setAuthModalOpen}
        authModalMode={authModalMode} setAuthModalMode={setAuthModalMode}
        addTitleModalOpen={addTitleModalOpen} setAddTitleModalOpen={setAddTitleModalOpen}
        showUserMenu={showUserMenu} setShowUserMenu={setShowUserMenu}
      />

      {/* ТОП: Баннер + правый столбец */}
      <div className="mx-auto max-w-7xl px-5 pt-6 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        {/* Левая колонка */}
        <div className="space-y-6">
          {/* Блок шапки */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl border shadow-sm ${cardBgClass} overflow-hidden`}>
            <div className="h-44 sm:h-56 md:h-60 relative">
              {profile.banner_url ? (
                <img src={profile.banner_url} alt="banner" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
              )}
              <div className="absolute inset-0 bg-black/20" />
            </div>

            <div className="bg-white text-gray-900 dark:bg-slate-900 dark:text-white transition-colors">
              <div className="px-6 py-5">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-center gap-6 min-w-0">
                    <div className="-mt-20">
                      <div className="relative h-[110px] w-[110px] overflow-hidden rounded-2xl bg-white ring-4 ring-white shadow-xl dark:bg-slate-800 dark:ring-slate-800">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-3xl bg-gradient-to-br from-blue-400 to-purple-600 text-white">👤</div>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <h1 className="text-2xl sm:text-3xl font-bold truncate">{(profile.full_name ?? '') || profile.username}</h1>
                      <div className="mt-1 text-[15px] text-slate-500 dark:text-slate-300">@{profile.username}</div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {user && user.id === profile.id ? (
                      <button onClick={() => setEditOpen(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                        Редактировать профиль
                      </button>
                    ) : (
                      <button
                        onClick={startDM}
                        disabled={dmLoading}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {dmLoading ? 'Открываем чат…' : 'Отправить сообщение'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* О себе */}
          {profile.bio && (
            <section className={`rounded-2xl border ${cardBgClass} p-5`}>
              <div className={`font-semibold mb-2 ${palette.text}`}>О себе</div>
              <p className={`${palette.textSecondary} leading-relaxed`}>{profile.bio}</p>
            </section>
          )}

          {/* Библиотека */}
          <section className={`rounded-2xl p-4 ${palette.card}`}>
            <div className={`flex items-center gap-6 pb-2 border-b ${palette.divider}`}>
              {tabs.map((t) => {
                const act = active === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActive(t.key)}
                    className={`pb-2 font-medium transition-colors border-b-2 ${act ? 'border-blue-500 text-blue-500' : `border-transparent ${palette.muted} hover:text-blue-500`}`}
                  >
                    {t.title} ({t.count})
                  </button>
                );
              })}
            </div>

            {visible.length === 0 ? (
              <div className={`pt-6 text-sm ${palette.muted}`}>Пока пусто</div>
            ) : (
              <div className="pt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {visible.map((item) => (
                  <MangaCard
                    key={`${active}-${item.manga_id}`}
                    item={item}
                    theme={theme}
                    favorite={favorites.some((f) => f.manga_id === item.manga_id)}
                    planned={planned.some((p) => p.manga_id === item.manga_id)}
                    dropped={dropped.some((d) => d.manga_id === item.manga_id)}
                    onFavorite={() => toggleFavorite(item)}
                    onCompleted={() => markCompleted(item)}
                    onPlan={() => toggleList(item, 'planned')}
                    onDrop={() => toggleList(item, 'dropped')}
                    editable={canEdit}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Правый столбец */}
        <aside className="space-y-6">
          <div className={`rounded-2xl border ${cardBgClass} p-5`}>
            <div className={`font-semibold mb-4 flex items-center gap-2 ${palette.text}`}>
              <TrendingUp className="w-4 h-4" />
              Статистика
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-500">{completed.length}</div>
                <div className={`text-xs ${palette.muted}`}>Прочитано</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">{reading.length}</div>
                <div className={`text-xs ${palette.muted}`}>Читаю</div>
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border ${cardBgClass} p-5`}>
            <div className={`font-semibold mb-3 flex items-center gap-2 ${palette.text}`}>
              <Heart className="w-4 h-4" />
              Любимые жанры
            </div>
            <div className="flex flex-wrap gap-2">
              {(profile.favorite_genres?.length ? profile.favorite_genres : stats.favoriteGenres).map((genre) => (
                <span
                  key={genre}
                  className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium
                              ring-1 ring-black/5 dark:ring-white/10 shadow-sm
                              ${genreBadgeClass(genre)}
                              ${mode === 'light' ? 'text-gray-900' : 'text-slate-100'}`}
                  title={genre}
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>

          {/* Активность */}
          <div className={`rounded-2xl border ${cardBgClass} p-5`}>
            <div className={`font-semibold mb-3 flex items-center gap-2 ${palette.text}`}>
              <Clock className="w-4 h-4" />
              Активность
            </div>

            <div className="space-y-3">
              {/* Регистрация */}
              <div className="flex items-center gap-3 text-sm">
                <div className={`p-1.5 rounded ${theme === 'light' ? 'bg-gray-200 text-gray-700' : 'bg-gray-800/60 text-gray-300'}`}>
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${palette.text}`}>Регистрация</div>
                  <div className={`text-xs ${palette.muted}`}>{stats.joinDate}</div>
                </div>
              </div>

              {/* Читает подряд */}
              <div className="flex items-center gap-3 text-sm">
                <div className={`p-1.5 rounded ${theme === 'light' ? 'bg-orange-200 text-orange-700' : 'bg-orange-900/40 text-orange-400'}`}>
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${palette.text}`}>Читает подряд</div>
                  <div className={`text-xs ${palette.muted}`}>{stats.readingStreak} дней</div>
                </div>
              </div>

              {/* Последние события */}
              {recentActivity.slice(0, 3).map((activity, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  <div
                    className={`p-1.5 rounded ${
                      activity.type === 'read'
                        ? theme === 'light' ? 'bg-blue-200 text-blue-700' : 'bg-blue-900/40 text-blue-400'
                        : activity.type === 'completed'
                        ? theme === 'light' ? 'bg-green-200 text-green-700' : 'bg-green-900/40 text-green-400'
                        : activity.type === 'favorited'
                        ? theme === 'light' ? 'bg-rose-200 text-rose-700' : 'bg-rose-900/40 text-rose-400'
                        : activity.type === 'planned'
                        ? theme === 'light' ? 'bg-yellow-200 text-yellow-700' : 'bg-yellow-900/40 text-yellow-400'
                        : theme === 'light' ? 'bg-rose-200 text-rose-700' : 'bg-rose-900/40 text-rose-400'
                    }`}
                  >
                    {activity.type === 'read' && <BookOpen className="w-3.5 h-3.5" />}
                    {activity.type === 'completed' && <Check className="w-3.5 h-3.5" />}
                    {activity.type === 'favorited' && <Heart className="w-3.5 h-3.5" />}
                    {activity.type === 'planned' && <Plus className="w-3.5 h-3.5" />}
                    {activity.type === 'dropped' && <Ban className="w-3.5 h-3.5" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className={`truncate font-medium ${palette.text}`}>
                      {activity.type === 'read' && 'Читает'}
                      {activity.type === 'completed' && 'Завершил'}
                      {activity.type === 'favorited' && 'Добавил в избранное'}
                      {activity.type === 'planned' && 'Запланировал'}
                      {activity.type === 'dropped' && 'Бросил'}
                    </div>
                    <div className={`text-xs ${palette.muted} truncate`}>
                      {activity.manga_title}
                    </div>
                  </div>

                  <div className={`text-xs ${palette.muted}`}>
                    {formatDate(activity.date)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(profile.telegram || profile.x_url || profile.vk_url || profile.discord_url) && (
            <div className={`rounded-2xl border ${cardBgClass} p-5`}>
              <div className={`font-semibold mb-4 flex items-center gap-2 ${palette.text}`}>
                <MessageSquare className="w-4 h-4" />
                Соцсети
              </div>

              <div className="flex flex-wrap gap-3">
                {profile.telegram && (
                  <a href={ensureProto(profile.telegram)} target="_blank" rel="noreferrer" className="group relative" title="Telegram">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center hover:scale-110 transition-transform duration-200 shadow-lg">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                      </svg>
                    </div>
                    <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      Telegram
                    </div>
                  </a>
                )}

                {profile.x_url && (
                  <a href={ensureProto(profile.x_url)} target="_blank" rel="noreferrer" className="group relative" title="X">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-800 to-black flex items-center justify-center hover:scale-110 transition-transform duration-200 shadow-lg">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    </div>
                    <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      X
                    </div>
                  </a>
                )}

                {profile.vk_url && (
                  <a href={ensureProto(profile.vk_url)} target="_blank" rel="noreferrer" className="group relative" title="ВКонтакте">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center hover:scale-110 transition-transform duration-200 shadow-lg text-white font-bold text-sm">
                      VK
                    </div>
                    <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      ВКонтакте
                    </div>
                  </a>
                )}

                {profile.discord_url && (
                  <a href={ensureProto(profile.discord_url)} target="_blank" rel="noreferrer" className="group relative" title="Discord">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center hover:scale-110 transition-transform duration-200 shadow-lg">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418Z"/>
                      </svg>
                    </div>
                    <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      Discord
                    </div>
                  </a>
                )}
              </div>
              <div className="h-2 mt-4"></div>
            </div>
          )}

          <div className={`rounded-2xl border ${cardBgClass} p-5`}>
            <div className={`font-semibold mb-3 flex items-center gap-2 ${palette.text}`}>
              <Eye className="w-4 h-4" />
              Друзья
            </div>
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-200 to-pink-200" />
              ))}
            </div>
            <div className={`mt-4 text-xs ${palette.muted}`}>Позже сюда подключим реальные данные 🙂</div>
          </div>
        </aside>
      </div>

      {/* Модалки */}
      {user && (
        <AddTitleModal
          open={addTitleModalOpen}
          onOpenChange={setAddTitleModalOpen}
          onSuccess={() => setAddTitleModalOpen(false)}
        />
      )}

      {user && user.id === profile.id && (
        <EditProfileModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          initial={initialEditValues}
          onSaved={(v) => {
            setProfile((p) => (p ? { ...p, ...v } : p));
            if (v.username && v.username !== profile.username) {
              router.replace(`/profile/${v.username}`);
            }
          }}
          theme={theme}
          profileId={profile.id}
        />
      )}
    </div>
  );
}

/* ==================== HELPERS ==================== */

function ensureProto(url: string) {
  if (!url) return url;
  const u = url.trim();
  if (u.startsWith('@')) return `https://t.me/${u.slice(1)}`;
  if (/^t\.me\//i.test(u)) return `https://${u}`;
  if (!/^https?:\/\//i.test(u)) return `https://${u}`;
  return u;
}

const GENRE_BADGES = [
  'bg-rose-200 border border-rose-300 dark:bg-rose-900/40 dark:border-rose-700/60',
  'bg-red-200 border border-red-300 dark:bg-red-900/40 dark:border-red-700/60',
  'bg-orange-200 border border-orange-300 dark:bg-orange-900/40 dark:border-orange-700/60',
  'bg-amber-200 border border-amber-300 dark:bg-amber-900/40 dark:border-amber-700/60',
  'bg-lime-200 border border-lime-300 dark:bg-lime-900/40 dark:border-lime-700/60',
  'bg-green-200 border border-green-300 dark:bg-green-900/40 dark:border-green-700/60',
  'bg-emerald-200 border border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700/60',
  'bg-teal-200 border border-teal-300 dark:bg-teal-900/40 dark:border-teal-700/60',
  'bg-cyan-200 border border-cyan-300 dark:bg-cyan-900/40 dark:border-cyan-700/60',
  'bg-sky-200 border border-sky-300 dark:bg-sky-900/40 dark:border-sky-700/60',
  'bg-blue-200 border border-blue-300 dark:bg-blue-900/40 dark:border-blue-700/60',
  'bg-indigo-200 border border-indigo-300 dark:bg-indigo-900/40 dark:border-indigo-700/60',
  'bg-violet-200 border border-violet-300 dark:bg-violet-900/40 dark:border-violet-700/60',
  'bg-fuchsia-200 border border-fuchsia-300 dark:bg-fuchsia-900/40 dark:border-fuchsia-700/60',
  'bg-purple-200 border border-purple-300 dark:bg-purple-900/40 dark:border-purple-700/60',
  'bg-pink-200 border border-pink-300 dark:bg-pink-900/40 dark:border-pink-700/60',
];

function genreBadgeClass(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return GENRE_BADGES[Math.abs(h) % GENRE_BADGES.length] || GENRE_BADGES[0];
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'сегодня';
  if (diffDays === 1) return 'вчера';
  if (diffDays <= 7) return `${diffDays}д назад`;
  return date.toLocaleDateString('ru-RU');
}

function MangaCard({
  item, theme, favorite, planned, dropped, onFavorite, onCompleted, onPlan, onDrop, editable,
}: {
  item: CardItem;
  theme: 'light' | 'dark';
  favorite: boolean;
  planned: boolean;
  dropped: boolean;
  onFavorite: () => void;
  onCompleted: () => void;
  onPlan: () => void;
  onDrop: () => void;
  editable: boolean;
}) {
  const card = theme === 'light' ? 'bg-white border border-gray-200' : 'bg-slate-900/60 border border-slate-700';
  const muted = theme === 'light' ? 'text-gray-500' : 'text-slate-400';
  const cardText = theme === 'light' ? 'text-gray-900' : 'text-white';

  return (
    <div className={`relative rounded-lg overflow-hidden shadow ${card}`}>
      <Link href={`/title/${item.manga_id}`}>
        <div className="w-full h-44 bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
          {item.cover_url ? (
            <img src={item.cover_url} alt={item.title ?? ''} className="w-full h-full object-cover" />
          ) : (
            <span className={muted}>Обложка манги</span>
          )}
        </div>
      </Link>

      {editable && (
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            onClick={onFavorite}
            title={favorite ? 'Убрать из избранного' : 'В избранное'}
            className={`rounded-md px-2 py-1 text-xs ${favorite ? 'bg-rose-600 text-white' : 'bg-white/90 dark:bg-slate-800/80 text-gray-800 dark:text-slate-200'} border border-black/5 shadow`}
          >
            ★
          </button>
          <button
            onClick={onCompleted}
            title="Отметить как прочитано"
            className="rounded-md px-2 py-1 text-xs bg-white/90 dark:bg-slate-800/80 text-gray-800 dark:text-slate-200 border border-black/5 shadow"
          >
            ✓
          </button>
          <button
            onClick={onPlan}
            title={planned ? 'Убрать из планов' : 'В планы'}
            className="rounded-md px-2 py-1 text-xs bg-white/90 dark:bg-slate-800/80 text-gray-800 dark:text-slate-200 border border-black/5 shadow"
          >
            📅
          </button>
          <button
            onClick={onDrop}
            title={dropped ? 'Вернуть в чтение' : 'Брошено'}
            className="rounded-md px-2 py-1 text-xs bg-white/90 dark:bg-slate-800/80 text-gray-800 dark:text-slate-200 border border-black/5 shadow"
          >
            ⛔
          </button>
        </div>
      )}

      <div className="p-3">
        <div className={`text-sm font-medium line-clamp-2 ${cardText}`}>{item.title ?? 'Без названия'}</div>
        <div className={`mt-1 text-xs ${muted}`}>ID: {item.manga_id}</div>
      </div>
    </div>
  );
}
