'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/lib/theme/context';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  BookOpen,
  Clock,
} from 'lucide-react';

/* ===================== types ===================== */
type QueueItem = {
  id: number;
  manga_id: number;
  chapter_number: number;
  volume: number;
  title: string;
  status: 'ready' | 'draft' | string;
  pages_count: number;
  created_at: string;

  manga_title?: string | null;
  manga_slug?: string | null;
};

type ApiList<T> = { ok?: boolean; items?: T[]; message?: string };

/* ===================== utils ===================== */
async function safeJson<T>(res: Response): Promise<T | null> {
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!text) return null;
  if (ct.includes('application/json')) {
    try { return JSON.parse(text) as T; } catch { return null; }
  }
  return null;
}

function fmtDate(s: string) {
  try { return new Date(s).toLocaleString('ru-RU'); } catch { return s; }
}

/* ===================== UI ===================== */
export default function ChapterReviewPanel() {
  const { theme } = useTheme();

  const bg = theme === 'light' ? 'bg-gray-50 text-gray-900' : 'text-gray-100';
  const card = theme === 'light'
    ? 'bg-white border border-gray-200'
    : 'bg-slate-900/50 border border-white/10';
  const muted = theme === 'light' ? 'text-gray-600' : 'text-slate-400';
  const btn = theme === 'light'
    ? 'inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-gray-900'
    : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800/70 hover:bg-slate-700 text-white';
  const approveBtn = theme === 'light'
    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
    : 'bg-emerald-500 hover:bg-emerald-400 text-black';
  const rejectBtn = theme === 'light'
    ? 'bg-rose-600 hover:bg-rose-500 text-white'
    : 'bg-rose-500 hover:bg-rose-400 text-black';

  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const total = queue.length;
  const readyCount = useMemo(() => queue.filter(q => String(q.status).toLowerCase() === 'ready').length, [queue]);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/chapters/pending', { credentials: 'include' });
      const j = (await safeJson<ApiList<QueueItem>>(r)) || {};
      if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
      setQueue(Array.isArray(j.items) ? j.items : []);
    } catch (e: any) {
      alert(e?.message || 'Не удалось загрузить очередь');
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function approve(chapterId: number) {
    if (busyId) return;
    setBusyId(chapterId);
    try {
      const r = await fetch('/api/admin/chapters/publish', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, deleteStaging: true }),
      });
      const j = await safeJson<{ ok?: boolean; message?: string }>(r);
      if (!r.ok || j?.ok === false) throw new Error(j?.message || `HTTP ${r.status}`);
      setQueue(q => q.filter(x => x.id !== chapterId));
    } catch (e: any) {
      alert(e?.message || 'Ошибка публикации');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(chapterId: number) {
    if (busyId) return;
    const reason = prompt('Причина отклонения (необязательно):') || '';
    setBusyId(chapterId);
    try {
      const r = await fetch('/api/admin/chapters/reject', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, reason }),
      });
      const j = await safeJson<{ ok?: boolean; message?: string }>(r);
      if (!r.ok || j?.ok === false) throw new Error(j?.message || `HTTP ${r.status}`);
      setQueue(q => q.filter(x => x.id !== chapterId));
    } catch (e: any) {
      alert(e?.message || 'Ошибка отклонения');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={bg}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Приёмка глав</h2>
          <div className={`text-sm ${muted}`}>
            В очереди: {total || 0} · готовых к публикации: {readyCount}
          </div>
        </div>

        <button
          className={`${btn} px-3 py-2`}
          disabled={loading}
          onClick={() => refresh()}
          title="Обновить"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {loading && (
        <div className={`text-sm ${muted}`}>Загрузка…</div>
      )}

      {!loading && queue.length === 0 && (
        <div className={`text-sm ${muted}`}>Очередь пуста.</div>
      )}

      <div className="space-y-3">
        {queue.map((q) => {
          const isReady = String(q.status).toLowerCase() === 'ready';
          const chapterLabel = `Том ${q.volume || 0} · Глава ${q.chapter_number}`;
          const tUrl = q.manga_slug
            ? `/manga/${q.manga_slug}`
            : `/manga/${q.manga_id}`;

          return (
            <div key={q.id} className={`rounded-xl p-4 ${card}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="h-5 w-5 opacity-70" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      <Link className="hover:underline" href={tUrl}>
                        {q.manga_title || `Тайтл #${q.manga_id}`}
                      </Link>
                      <span className="mx-2">•</span>
                      <span>{chapterLabel}</span>
                    </div>
                    <div className={`text-xs ${muted}`}>
                      ID: {q.id} · страниц: {q.pages_count} · статус: {q.status} · загружено: {fmtDate(q.created_at)}
                    </div>
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-xs ${muted}`}>
                    <Clock className="h-4 w-4" />
                    {fmtDate(q.created_at)}
                  </span>

                  <button
                    className={`px-3 py-2 rounded-lg inline-flex items-center gap-2 ${approveBtn}`}
                    disabled={busyId === q.id || !isReady}
                    onClick={() => approve(q.id)}
                    title={isReady ? 'Одобрить и опубликовать' : 'Глава ещё не в статусе ready'}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Одобрить
                  </button>

                  <button
                    className={`px-3 py-2 rounded-lg inline-flex items-center gap-2 ${rejectBtn}`}
                    disabled={busyId === q.id}
                    onClick={() => reject(q.id)}
                    title="Отклонить"
                  >
                    <XCircle className="h-4 w-4" />
                    Отклонить
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
