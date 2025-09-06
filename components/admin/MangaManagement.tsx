'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
  User,
  BookOpen,
  ExternalLink,
  Filter,
  X,
  Trash2,
  Clock,
  Database,
  Info,
} from 'lucide-react';
import { useTheme } from '@/lib/theme/context';

/* ===========================
   Типы
   =========================== */

type SubmissionStatus = 'approved' | 'rejected' | 'pending';

type Item = {
  id?: number | null;
  sid?: string | null;
  uid?: string | null;

  kind: 'manga' | 'suggestion';

  title: string;
  cover_url: string | null;
  author: string | null;
  artist: string | null;
  description: string | null;
  status: string | null;
  submission_status: SubmissionStatus;
  created_at: string;
  updated_at?: string;

  original_title?: string | null;
  type?: string | null;
  translation_status?: string | null;
  age_rating?: string | number | null;
  release_year?: number | string | null;

  slug?: string | null;
  title_romaji?: string | null;

  genres?: any;
  tags?: any;
  payload?: any;
  manga_genres?: any;
  tag_list?: any;
  translator_team_id?: string | null;

  author_comment?: string | null;
  sources?: string[] | null;
  author_name?: string | null;
};

type Stats = {
  total: number;
  manga: number;
  suggestions: number;
  pending: number;
  approved: number;
  rejected: number;
};

type CleanupStats = {
  autoCleanupDays: number;
  cutoffDate: string;
  olderThanDays: number;
  lastCleanup: {
    timestamp: string;
    deletedCount: number;
    types: {
      suggestions: number;
      orphanedManga: number;
    };
  } | null;
  daysSinceLastCleanup: number | null;
  needsAutoCleanup: boolean;
  stats: {
    suggestions: {
      total: number;
      approved: number;
      rejected: number;
      oldest_reviewed: string | null;
    };
    total: {
      total: number;
      approved: number;
      rejected: number;
    };
  };
  message: string;
};

/* ===========================
   Хелперы
   =========================== */

const PLACEHOLDER = '/cover-placeholder.png';

/** Приводим src к валидному виду для <Image>. */
function safeImageSrc(src?: string | null): string {
  if (!src) return PLACEHOLDER;
  const s = String(src).trim();
  if (!s) return PLACEHOLDER;

  // относительный путь из /public
  if (s.startsWith('/')) return s;

  // data:/blob:
  if (/^(data:image|blob:)/i.test(s)) return s;

  // абсолютный URL
  try {
    const u = new URL(s);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      // Если это внешний URL (xim.ru, wasabisys.com), используем proxy
      if (s.includes('xim.ru') || s.includes('wasabisys.com')) {
        return `/api/image-proxy?url=${encodeURIComponent(s)}`;
      }
      return u.toString();
    }
  } catch {
    /* ignore */
  }

  // что-то типа "uploads/file.jpg" — добавим ведущий слэш
  if (/^[a-z0-9/_\-\.]+$/i.test(s)) return '/' + s.replace(/^\/+/, '');

  return PLACEHOLDER;
}

function keyFor(item: Item): string {
  const idPart =
    (item.uid && String(item.uid)) ||
    (item.sid && String(item.sid)) ||
    (item.id != null ? String(item.id) : null) ||
    item.created_at ||
    item.title;
  return `${item.kind}-${idPart}`;
}

/** Унифицируем преобразование в массив строк (genres/tags). */
function toStrList(v: any): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v
      .map((x) =>
        typeof x === 'string'
          ? x
          : (x?.name ?? x?.title ?? x?.value ?? x?.genre ?? x?.tag ?? '') as string,
      )
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === 'object') {
    return toStrList(
      v.values ??
        v.list ??
        v.items ??
        v.names ??
        v.genres ??
        v.tags ??
        v.genre_names ??
        v.tag_names ??
        v.keywords ??
        v.tags_csv,
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

function extractGenres(obj: any): string[] {
  const p = obj?.payload ?? {};
  return toStrList(
    p.genres ?? p.manga_genres ?? p.genre_names ?? obj?.genres ?? obj?.manga_genres,
  );
}

function extractTags(obj: any): string[] {
  const p = obj?.payload ?? {};
  return toStrList(
    p.tags ?? p.tag_list ?? p.tag_names ?? p.keywords ?? p.tags_csv ?? obj?.tags ?? obj?.tag_list,
  );
}

/** Возвращаем undefined для "пустых" значений. */
function pick<T = any>(...vals: any[]): T | undefined {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '' && v !== '—') return v as T;
  }
  return undefined as any;
}

function buildViewData(it: Item) {
  const p =
    it.payload && typeof it.payload === 'object' && Object.keys(it.payload).length > 0
      ? it.payload
      : {};

  const title = pick(it.title, p.title_ru, p.title) ?? 'Без названия';
  const title_romaji =
    pick(it.title_romaji, it.original_title, p.original_title, p.title_romaji) ?? 'Не указано';
  const author = pick(it.author, p.author) ?? 'Не указан';
  const artist = pick(it.artist, p.artist) ?? 'Не указан';

  const statusMap: Record<string, string> = {
    ongoing: 'Выходит',
    completed: 'Завершён',
    hiatus: 'На паузе',
    cancelled: 'Отменён',
    продолжается: 'Продолжается',
    завершена: 'Завершена',
    заморожена: 'Заморожена',
  };
  const rawStatus = pick(it.status, p.status) ?? 'Не указан';
  const status = statusMap[String(rawStatus).toLowerCase()] || rawStatus;

  const translationStatusMap: Record<string, string> = {
    продолжается: 'Продолжается',
    ongoing: 'Продолжается',
    completed: 'Завершён',
    завершён: 'Завершён',
    hiatus: 'На паузе',
    'на паузе': 'На паузе',
  };
  const rawTranslationStatus = pick(it.translation_status, p.translation_status) ?? 'Не указан';
  const translation_status =
    translationStatusMap[String(rawTranslationStatus).toLowerCase()] || rawTranslationStatus;

  const age_rating = pick(it.age_rating, p.age_rating) ?? 'Не указан';
  const release_year = pick(it.release_year, p.release_year) ?? 'Не указан';

  const typeMap: Record<string, string> = {
    манга: 'Манга',
    manga: 'Манга',
    manhwa: 'Манхва',
    manhua: 'Маньхуа',
    'веб-манга': 'Веб-манга',
    додзинси: 'Додзинси',
    oneshot: 'Ваншот',
  };
  const rawType = pick(it.type, p.type) ?? 'Не указан';
  const type = typeMap[String(rawType).toLowerCase()] || rawType;

  const coverCandidate = pick<string>(it.cover_url, p.cover_url) ?? null;
  const cover = safeImageSrc(coverCandidate);

  const description = pick(it.description, p.description) ?? '';
  const genres = extractGenres(it).join(', ') || '';
  const tags = extractTags(it).join(', ') || '';
  const submittedBy = pick(it.author_name, p.author_name) ?? 'Не указан';

  return {
    title,
    title_romaji,
    author,
    artist,
    status,
    translation_status,
    age_rating,
    release_year,
    type,
    cover,
    description,
    genres,
    tags,
    submittedBy,
  };
}

/* ===========================
   Компонент
   =========================== */

export default function MangaManagement() {
  const { theme } = useTheme();

  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    manga: 0,
    suggestions: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SubmissionStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'manga' | 'suggestion'>('all');

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  // Состояние для автоочистки
  const [cleanupStats, setCleanupStats] = useState<CleanupStats | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  const textClass = theme === 'light' ? 'text-gray-900' : 'text-white';
  const mutedText = theme === 'light' ? 'text-gray-600' : 'text-gray-400';
  const cardBg =
    theme === 'light' ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-900/40 border-white/10';
  const inputClass =
    theme === 'light'
      ? 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
      : 'w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-400';
  const badge = 'rounded-full border px-2 py-0.5 text-xs font-medium';
  const btnPrimary =
    theme === 'light' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-emerald-500 text-black hover:bg-emerald-400';
  const btnDanger =
    theme === 'light' ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-rose-500 text-black hover:bg-rose-400';
  const btnSecondary =
    theme === 'light'
      ? 'border-gray-300 bg-white hover:bg-gray-100 text-gray-900'
      : 'border-white/10 bg-gray-800/60 hover:bg-gray-700 text-white';
  const btnWarning =
    theme === 'light' ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-orange-500 text-black hover:bg-orange-400';

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/manga-moderation', {
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-admin': '1' },
      });
      const txt = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(txt || '{}');
      } catch {
        json = {};
      }
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      setItems(Array.isArray(json.items) ? json.items : []);
      setStats(
        json.stats || {
          total: 0,
          manga: 0,
          suggestions: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
        },
      );
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }

  async function loadCleanupStats() {
    try {
      setCleanupError(null);
      console.log(`Loading cleanup stats...`);
      
      const res = await fetch(`/api/admin/manga-moderation/cleanup?olderThanDays=15`, {
        headers: { 
          'x-admin': '1',
          'Content-Type': 'application/json'
        },
      });

      console.log(`Cleanup stats response status: ${res.status}`);
      
      if (!res.ok) {
        const errorMsg = `HTTP ${res.status}: Failed to load cleanup stats`;
        console.error(errorMsg);
        setCleanupError(errorMsg);
        return;
      }

      const responseText = await res.text();
      console.log('Cleanup stats response:', responseText);
      
      if (!responseText) {
        const errorMsg = 'Empty response from cleanup stats API';
        console.error(errorMsg);
        setCleanupError(errorMsg);
        return;
      }
      
      let json: any = {};
      try {
        json = JSON.parse(responseText);
      } catch (parseError) {
        const errorMsg = 'Invalid JSON response from cleanup stats API';
        console.error(errorMsg, parseError);
        setCleanupError(errorMsg);
        return;
      }

      if (json.ok) {
        console.log('Cleanup stats loaded successfully:', json);
        setCleanupStats(json);
      } else {
        const errorMsg = json.error || json.message || 'Cleanup stats API returned error';
        console.error(errorMsg);
        setCleanupError(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = `Network error: ${err.message}`;
      console.error('Failed to load cleanup stats:', err);
      setCleanupError(errorMsg);
    }
  }

  useEffect(() => {
    loadData();
    loadCleanupStats();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const v = buildViewData(item);
      const haystack = [v.title, v.author, v.artist, v.title_romaji]
        .filter((x) => x && x !== 'Не указан' && x !== 'Не указано' && x !== 'Без названия')
        .join(' ')
        .toLowerCase();
      const matchesSearch = !searchQuery || haystack.includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || item.submission_status === statusFilter;
      const matchesType = typeFilter === 'all' || item.kind === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [items, searchQuery, statusFilter, typeFilter]);

  async function handleModerationAction(
    item: Item,
    action: 'approved' | 'rejected',
    note?: string,
  ) {
    const k = keyFor(item);
    setBusyKey(k);
    try {
      // оптимистично меняем статус
      setItems((prev) =>
        prev.map((x) => (keyFor(x) === k ? { ...x, submission_status: action } : x)),
      );

      const payload = {
        action,
        note: note ?? null,
        id: item.id ?? null,
        sid: item.sid ?? item.uid ?? null,
        kind: item.kind,
      };
      const res = await fetch('/api/admin/manga-moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin': '1' },
        body: JSON.stringify(payload),
      });
      const txt = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(txt || '{}');
      } catch {
        json = {};
      }
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await loadData();
      setSelectedItem(null);
    } catch (err: any) {
      alert(`Ошибка: ${err.message}`);
      await loadData(); // откат
    } finally {
      setBusyKey(null);
    }
  }



  function getStatusBadge(status: SubmissionStatus) {
    const variants = {
      pending:
        'bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-500/20 dark:border-yellow-500/50 dark:text-yellow-300',
      approved:
        'bg-green-100 border-green-300 text-green-800 dark:bg-green-500/20 dark:border-green-500/50 dark:text-green-300',
      rejected:
        'bg-red-100 border-red-300 text-red-800 dark:bg-red-500/20 dark:border-red-500/50 dark:text-red-300',
    } as const;
    const labels = {
      pending: 'На модерации',
      approved: 'Одобрено',
      rejected: 'Отклонено',
    } as const;
    return <span className={`${badge} ${variants[status]}`}>{labels[status]}</span>;
  }

  function getTypeBadge(kind: 'manga' | 'suggestion') {
    const variants = {
      manga:
        'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-500/20 dark:border-blue-500/50 dark:text-blue-300',
      suggestion:
        'bg-purple-100 border-purple-300 text-purple-800 dark:bg-purple-500/20 dark:border-purple-500/50 dark:text-purple-300',
    } as const;
    const labels = { manga: 'Манга', suggestion: 'Заявка' } as const;
    return <span className={`${badge} ${variants[kind]}`}>{labels[kind]}</span>;
  }

  function formatRelativeTime(timestamp: string): string {
    const diff = Date.now() - new Date(timestamp).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'сегодня';
    if (days === 1) return 'вчера';
    if (days < 7) return `${days} дн. назад`;
    if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
    return `${Math.floor(days / 30)} мес. назад`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Модерация манги</h1>
        <p className={`${mutedText}`}>Управление заявками на новые тайтлы и существующими мангами.</p>
      </div>

      {/* Stats + Cleanup Warning */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {[
            { label: 'Всего', value: stats.total },
            { label: 'Манга', value: stats.manga },
            { label: 'Заявки', value: stats.suggestions },
            { label: 'На модерации', value: stats.pending },
            { label: 'Одобрено', value: stats.approved },
            { label: 'Отклонено', value: stats.rejected },
          ].map((s) => (
            <div key={s.label} className={`p-4 rounded-xl border ${cardBg}`}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className={`text-sm ${mutedText}`}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Cleanup Status */}
        {cleanupError && (
          <div className={`rounded-xl border p-4 ${
            theme === 'light'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-red-500/10 border-red-500/30 text-red-100'
          }`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">Ошибка загрузки статистики очистки</span>
            </div>
            <p className="mt-1 text-sm">{cleanupError}</p>
            <button 
              onClick={loadCleanupStats} 
              className="mt-2 text-sm underline hover:no-underline"
            >
              Попробовать снова
            </button>
          </div>
        )}
        
        {cleanupStats && !cleanupError && (
          <div className={`rounded-xl border p-4 ${cardBg}`}>
            <div className="flex items-center gap-3">
              <Database className={`h-5 w-5 ${mutedText}`} />
              <div className="flex-1">
                <div className={`font-medium ${textClass}`}>Автоочистка базы данных</div>
                <div className={`text-sm ${mutedText}`}>
                  {cleanupStats.stats.total.total > 0 ? (
                    <>
                      {cleanupStats.stats.total.total} отработанных заявок будут автоматически удалены через {cleanupStats.autoCleanupDays} дней после модерации
                      {cleanupStats.lastCleanup && (
                        <span className="block mt-1">
                          Последняя очистка: {formatRelativeTime(cleanupStats.lastCleanup.timestamp)} ({cleanupStats.lastCleanup.deletedCount} удалено)
                        </span>
                      )}
                    </>
                  ) : (
                    'Система автоматически очищает отработанные заявки через 15 дней'
                  )}
                </div>
              </div>
              
              {cleanupStats.stats.total.total > 0 && (
                <div className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md ${
                  theme === 'light' 
                    ? 'bg-green-100 text-green-700 border border-green-200' 
                    : 'bg-green-500/20 text-green-300 border border-green-500/30'
                }`}>
                  <Clock className="h-3 w-3" />
                  Авто-очистка активна
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className={`p-4 rounded-xl border ${cardBg}`}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${mutedText}`} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию, автору, художнику..."
              className={`${inputClass} pl-10`}
            />
          </div>

          <div className="flex items-center gap-3">
            <Filter className={`w-5 h-5 ${mutedText}`} />
            <select
              className={inputClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">Все статусы ({stats.total})</option>
              <option value="pending">На модерации ({stats.pending})</option>
              <option value="approved">Одобрено ({stats.approved})</option>
              <option value="rejected">Отклонено ({stats.rejected})</option>
            </select>

            <select
              className={inputClass}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
            >
              <option value="all">Все типы</option>
              <option value="manga">Манга ({stats.manga})</option>
              <option value="suggestion">Заявки ({stats.suggestions})</option>
            </select>

            <button
              onClick={() => {
                loadData();
                loadCleanupStats();
              }}
              disabled={loading}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${btnSecondary} disabled:opacity-50`}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Errors / Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className={`${mutedText}`}>Загрузка данных...</span>
        </div>
      )}

      {error && (
        <div
          className={`rounded-xl border p-4 ${
            theme === 'light'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-red-500/10 border-red-500/30 text-red-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Ошибка загрузки</span>
          </div>
          <p className="mt-1">{error}</p>
          <button onClick={loadData} className="mt-2 text-sm underline hover:no-underline">
            Попробовать снова
          </button>
        </div>
      )}

      {/* Cards */}
      {!loading && !error && (
        <>
          {filteredItems.length === 0 ? (
            <div className={`rounded-xl border p-8 text-center ${cardBg}`}>
              <div className={`${mutedText} mb-4`}>
                <BookOpen className="mx-auto h-12 w-12 mb-2 opacity-50" />
                <p>Ничего не найдено</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => {
                const k = keyFor(item);
                const busy = busyKey === k;
                const v = buildViewData(item);

                return (
                  <div key={k} className={`rounded-xl border p-4 transition-all hover:shadow-md ${cardBg}`}>
                    <div className="flex gap-3">
                      <div className="relative h-[120px] w-[90px] overflow-hidden rounded-md border flex-shrink-0">
                        <Image
                          src={v.cover}
                          alt={v.title}
                          fill
                          sizes="(max-width: 768px) 90px, 90px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-2">
                          <h3 className={`font-semibold truncate ${textClass}`}>{v.title}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {getTypeBadge(item.kind)}
                            {getStatusBadge(item.submission_status)}
                          </div>
                        </div>

                        <div className={`text-sm ${mutedText} space-y-1`}>
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span className="truncate">
                              <strong>Автор:</strong> {v.author || '—'}
                            </span>
                          </div>
                          {v.description && <div className="line-clamp-2">{v.description}</div>}
                          {v.genres && (
                            <div className="line-clamp-1">
                              <strong>Жанры:</strong> {v.genres}
                            </div>
                          )}
                          {v.tags && (
                            <div className="line-clamp-1">
                              <strong>Теги:</strong> {v.tags}
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          {item.submission_status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleModerationAction(item, 'approved')}
                                disabled={busy}
                                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm ${btnPrimary} disabled:opacity-50`}
                              >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                Одобрить
                              </button>
                              <button
                                onClick={() => handleModerationAction(item, 'rejected')}
                                disabled={busy}
                                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm ${btnDanger} disabled:opacity-50`}
                              >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                Отклонить
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => setSelectedItem(item)}
                            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${btnSecondary}`}
                          >
                            Подробнее
                          </button>

                          {(item.slug || item.id) && (
                            <a
                              href={`/title/${item.slug ?? item.id ?? ''}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${btnSecondary}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                              Открыть
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Item Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedItem(null)} />
          <div className={`relative z-10 w-full max-w-4xl max-h-[90vh] overflow-auto rounded-2xl border p-6 ${cardBg}`}>
            {(() => {
              const v = buildViewData(selectedItem);
              return (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className={`text-xl font-semibold ${textClass}`}>{v.title}</div>
                      <div className={`text-xs ${mutedText} mt-1`}>
                        Создано: {new Date(selectedItem.created_at).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedItem(null)}
                      className={`rounded-lg p-2 ${theme === 'light' ? 'hover:bg-gray-100' : 'hover:bg-gray-800'}`}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="grid gap-6 md:grid-cols-[200px_1fr]">
                    <div className="relative h-[280px] w-[200px] overflow-hidden rounded-md border">
                      <Image 
                        src={v.cover} 
                        alt="cover" 
                        fill 
                        sizes="200px" 
                        className="object-cover" 
                        unoptimized
                      />
                    </div>

                    <div className={`space-y-2 text-sm ${textClass}`}>
                      <div><span className="font-medium">Ромадзи:</span> {v.title_romaji}</div>
                      <div><span className="font-medium">Отправил:</span> {v.submittedBy}</div>
                      <div><span className="font-medium">Автор:</span> {v.author}</div>
                      <div><span className="font-medium">Художник:</span> {v.artist}</div>
                      <div><span className="font-medium">Статус тайтла:</span> {v.status}</div>
                      <div><span className="font-medium">Статус перевода:</span> {v.translation_status}</div>
                      <div><span className="font-medium">Возраст:</span> {v.age_rating}</div>
                      <div><span className="font-medium">Год:</span> {v.release_year}</div>
                      <div><span className="font-medium">Тип:</span> {v.type}</div>
                      <div><span className="font-medium">Жанры:</span> {v.genres || 'Не указаны'}</div>
                      <div><span className="font-medium">Теги:</span> {v.tags || 'Не указаны'}</div>

                      {v.description && (
                        <div className="pt-2">
                          <div className="text-sm font-medium">Описание</div>
                          <div className={`text-sm ${mutedText} whitespace-pre-wrap`}>{v.description}</div>
                        </div>
                      )}

                      {selectedItem.payload && (
                        <div className="pt-4 border-t">
                          <details>
                            <summary className="cursor-pointer text-xs font-medium opacity-60">
                              Отладка: Raw payload
                            </summary>
                            <pre className="text-xs mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded overflow-auto">
                              {JSON.stringify(selectedItem.payload, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-2">
                    {selectedItem.submission_status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleModerationAction(selectedItem, 'approved')}
                          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm ${btnPrimary}`}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Одобрить
                        </button>
                        <button
                          onClick={() => handleModerationAction(selectedItem, 'rejected')}
                          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm ${btnDanger}`}
                        >
                          <XCircle className="h-4 w-4" /> Отклонить
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setSelectedItem(null)}
                      className={`rounded-md border px-4 py-2 text-sm transition-colors ${btnSecondary}`}
                    >
                      Закрыть
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}