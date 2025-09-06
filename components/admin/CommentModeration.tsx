"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Search, Loader2, RefreshCw, AlertTriangle, Trash2, Filter, MessageSquare,
  ShieldAlert, CheckCircle2, EyeOff, UserRound, ExternalLink
} from "lucide-react";
import { useTheme } from "@/lib/theme/context";

/* ===================== Types ===================== */
type ApiComment = {
  id: string;
  source: "manga" | "page" | "post";
  target_id: string | null;
  target_title?: string | null;
  content: string;
  created_at: string;
  author_id?: string | null;
  author_name?: string | null;
  reports_count?: number;
  is_hidden?: boolean;
};
type ApiResponse = { ok: true; items: ApiComment[]; total: number };

type UIComment = {
  id: string;
  source: "manga" | "page" | "post";
  target_id: string | null;
  target_title?: string | null;
  body: string;
  created_at: string;
  author_id?: string | null;
  author_name?: string | null;
  reports: number;
  hidden: boolean;
  raw: ApiComment;
};

function mapApiToUI(c: ApiComment): UIComment {
  return {
    id: c.id,
    source: c.source,
    target_id: c.target_id ?? null,
    target_title: c.target_title ?? null,
    body: String(c.content ?? ""),
    created_at: c.created_at,
    author_id: c.author_id ?? null,
    author_name: c.author_name ?? null,
    reports: Number(c.reports_count ?? 0),
    hidden: Boolean(c.is_hidden),
    raw: c,
  };
}

/* ===================== utils ===================== */
async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text || "{}");
  } catch {
    throw new Error(`Bad JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok || data?.ok === false)
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  return data as T;
}

function makeTargetUrl(src: UIComment["source"], id: string | null) {
  if (!id) return null;
  if (src === "manga") return `/manga/${id}`;
  if (src === "page")  return `/page/${id}`;
  return `/post/${id}`;
}
function makeAuthorUrl(id?: string | null) {
  if (!id) return null;
  return `/profile/${id}`; // поменяйте на ваш реальный роут профиля, если нужно
}

// экранирование html
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ===================== Component ===================== */
export default function CommentModeration() {
  const { theme } = useTheme();

  const [items, setItems] = useState<UIComment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [source, setSource] = useState<"all" | "manga" | "page" | "post">("all");

  // бан-лист
  const [banlist, setBanlist] = useState<string[]>([]);
  const banRegex = useMemo(() => {
    const parts = banlist.map(escapeRegex).filter(Boolean);
    if (!parts.length) return null;
    try {
      return new RegExp(`(${parts.join("|")})`, "gi"); // регистронезависимо
    } catch {
      return null;
    }
  }, [banlist]);

  const LIMIT = 50;
  const [nextOffset, setNextOffset] = useState(0);
  const hasMore = items.length < total;

  // стили
  const textClass  = theme === "light" ? "text-gray-900" : "text-white";
  const mutedText  = theme === "light" ? "text-gray-600" : "text-gray-400";
  const cardBg     = theme === "light" ? "bg-white border-gray-200 shadow-sm" : "bg-gray-900/40 border-white/10";
  const inputClass = theme === "light"
    ? "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    : "w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-400";
  const btnSecondary = theme === "light"
    ? "border-gray-300 bg-white hover:bg-gray-100 text-gray-900"
    : "border-white/10 bg-gray-800/60 hover:bg-gray-700 text-white";

  // загрузка бан-листа один раз
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJson<{ ok: true; items: string[] }>(`/api/moderation/banned`);
        setBanlist(Array.isArray(data.items) ? data.items : []);
      } catch {
        setBanlist([]);
      }
    })();
  }, []);

  async function loadPage(reset = false) {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      sp.set("limit", String(LIMIT));
      sp.set("offset", String(reset ? 0 : nextOffset));
      sp.set("source", source);
      if (searchQuery) sp.set("q", searchQuery);

      const data = await fetchJson<ApiResponse>(`/api/moderation/comments?${sp.toString()}`);
      const next = (data.items || []).map(mapApiToUI);

      if (reset) {
        setItems(next);
        setNextOffset(next.length);
      } else {
        setItems((prev) => [...prev, ...next]);
        setNextOffset((o) => o + next.length);
      }
      setTotal(Number(data.total || 0));
    } catch (e: any) {
      setError(e.message || "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => loadPage(true), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, source]);

  const flaggedCount = useMemo(() => {
    let c = 0;
    for (const it of items) if (it.reports > 0 || it.hidden) c++;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const base = !searchQuery
      ? items
      : items.filter((c) => `${c.body}`.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!onlyFlagged) return base;
    return base.filter((c) => c.reports > 0 || c.hidden);
  }, [items, searchQuery, onlyFlagged]);

  function highlight(body: string) {
    // 1) помечаем совпадения маркерами, 2) экранируем, 3) меняем маркеры на <mark>
    if (!banRegex) return { __html: escapeHtml(body) };
    const START = "\u0000"; // маркеры не встречаются в тексте
    const END   = "\u0001";
    const marked = body.replace(banRegex, `${START}$1${END}`);
    const escaped = escapeHtml(marked);
    const html = escaped
      .replaceAll(START, `<mark class="bg-yellow-500/30 text-current rounded px-0.5">`)
      .replaceAll(END, `</mark>`);
    return { __html: html };
  }

  async function actApprove(id: string, src: UIComment["source"]) {
    setBusyId(id);
    try {
      await fetchJson<{ ok: true }>(`/api/moderation/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", id, source: src }),
      });
      setItems((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, reports: 0, hidden: false, raw: { ...c.raw, reports_count: 0, is_hidden: false } } : c
        )
      );
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function actDelete(id: string, src: UIComment["source"]) {
    setBusyId(id);
    try {
      await fetchJson<{ ok: true }>(`/api/moderation/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id, source: src }),
      });
      setItems((prev) => prev.filter((c) => c.id !== id));
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Модерация комментариев</h1>
        <p className={`${mutedText}`}>Запрещённые фрагменты подсвечены. Можно одобрить (сброс жалоб) или удалить.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
        {[{ label: "Всего", value: total }, { label: "Требуют внимания", value: flaggedCount }].map((s) => (
          <div key={s.label} className={`p-4 rounded-xl border ${cardBg}`}>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className={`text-sm ${mutedText}`}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className={`p-4 rounded-xl border ${cardBg}`}>
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
          <div className="flex-1 relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${mutedText}`} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по тексту..."
              className={`${inputClass} pl-10`}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className={`text-sm ${mutedText}`}>Источник:</label>
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value as any);
                setNextOffset(0);
              }}
              className={
                theme === "light"
                  ? "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  : "rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
              }
            >
              <option value="all">Все</option>
              <option value="manga">Тайтлы</option>
              <option value="page">Страницы</option>
              <option value="post">Посты</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <Filter className={`w-5 h-5 ${mutedText}`} />
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={onlyFlagged}
                onChange={(e) => setOnlyFlagged(e.target.checked)}
              />
              Только проблемные
            </label>
            <button
              onClick={() => loadPage(true)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${btnSecondary}`}
              title="Обновить"
            >
              <RefreshCw className="h-4 w-4" />
              Обновить
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className={`rounded-xl border p-3 ${
            theme === "light"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-red-500/10 border-red-500/30 text-red-100"
          }`}
        >
          <AlertTriangle className="inline h-4 w-4 mr-2" />
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {filtered.length === 0 && !loading && (
          <div className={`rounded-xl border p-8 text-center ${cardBg}`}>
            <MessageSquare className="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p className={`${mutedText}`}>Нет комментариев по текущим фильтрам</p>
          </div>
        )}

        {filtered.map((c) => {
          const targetUrl = makeTargetUrl(c.source, c.target_id);
          const authorUrl = makeAuthorUrl(c.author_id);
          const violations = (c.reports > 0 ? 1 : 0) + (c.hidden ? 1 : 0);

          return (
            <div key={`${c.created_at}-${c.id}`} className={`rounded-xl border p-4 ${cardBg}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {violations > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full border border-red-400 px-2 py-0.5 text-red-600 dark:text-red-300">
                        <ShieldAlert className="h-3 w-3" />
                        {c.hidden ? "Скрыт" : "Подозрительный"}
                      </span>
                    )}
                    {c.reports > 0 && (
                      <span className="text-xs rounded-full border border-yellow-400 px-2 py-0.5 text-yellow-700 dark:text-yellow-300">
                        Жалоб: {c.reports}
                      </span>
                    )}
                    <span className={`text-xs ${mutedText}`}>{new Date(c.created_at).toLocaleString("ru-RU")}</span>
                    <span className={`text-xs ${mutedText}`}>·</span>
                    {targetUrl ? (
                      <a
                        href={targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline inline-flex items-center gap-1"
                        title="Открыть объект"
                      >
                        {c.source === "manga" ? "Тайтл" : c.source === "page" ? "Страница" : "Пост"}{" "}
                        {c.target_title ? `«${c.target_title}»` : `#${c.target_id}`}
                        <ExternalLink className="w-3 h-3 opacity-70" />
                      </a>
                    ) : (
                      <span className={`text-xs ${mutedText}`}>
                        {c.source === "manga" ? "Тайтл" : c.source === "page" ? "Страница" : "Пост"} #?
                      </span>
                    )}
                    {(c.author_id || c.author_name) && (
                      <>
                        <span className={`text-xs ${mutedText}`}>·</span>
                        {authorUrl ? (
                          <a
                            href={authorUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline inline-flex items-center gap-1"
                            title="Открыть профиль"
                          >
                            <UserRound className="w-3 h-3 opacity-70" />
                            {c.author_name || c.author_id}
                            <ExternalLink className="w-3 h-3 opacity-70" />
                          </a>
                        ) : (
                          <span className={`text-xs ${mutedText}`}>
                            <UserRound className="inline w-3 h-3 mr-1 opacity-70" />
                            {c.author_name || c.author_id}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* ПОДСВЕТКА ЗАПРЕЩЁННЫХ ФРАГМЕНТОВ */}
                  <div
                    className={`text-sm ${textClass} whitespace-pre-wrap break-words`}
                    dangerouslySetInnerHTML={highlight(c.body)}
                  />
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  {c.hidden && (
                    <button
                      onClick={() => actApprove(c.id, c.source)}
                      disabled={busyId === c.id}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-50"
                      title="Одобрить (сбросить жалобы и раскрыть)"
                    >
                      {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Одобрить
                    </button>
                  )}

                  <button
                    onClick={() => actDelete(c.id, c.source)}
                    disabled={busyId === c.id}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-50 text-red-500"
                    title="Удалить"
                  >
                    {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Удалить
                  </button>

                  {c.hidden && (
                    <div className="flex items-center gap-1 text-[11px] opacity-70">
                      <EyeOff className="h-3.5 w-3.5" />
                      скрыт автоматически
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {hasMore && (
          <div className="flex justify-center">
            <button onClick={() => loadPage(false)} className={`rounded-lg border px-4 py-2 ${btnSecondary}`}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Загрузить ещё"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
