'use client';

import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, Flag } from 'lucide-react';

type Item = {
  id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  // опциональные поля, если бэкенд их отдаёт
  is_hidden?: boolean | null;
  reports_count?: number | null;
};

export default function PageComments({ pageId }: { pageId: number | string | undefined }) {
  if (pageId === undefined || pageId === null || String(pageId).trim() === '') return null;

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // статус отправки жалобы по id
  const [reporting, setReporting] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});

  async function load() {
    try {
      setLoading(true);
      const r = await fetch(`/api/pages/${encodeURIComponent(String(pageId))}/comments?limit=200`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      setItems((j.items ?? []) as Item[]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pageId]);

  const updateEmpty = () => {
    const plain = editorRef.current?.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
    setIsEmpty(!plain);
  };

  function exec(cmd: 'bold'|'italic'|'underline'|'strikeThrough') {
    document.execCommand(cmd);
    editorRef.current?.focus();
  }

  function trySend() {
    alert('Добавление комментариев временно отключено до внедрения кастомной авторизации.');
  }

  async function report(commentId: string) {
    setReporting((m) => ({ ...m, [commentId]: 'sending' }));
    try {
      const r = await fetch(`/api/pages/${encodeURIComponent(String(pageId))}/comments/${encodeURIComponent(commentId)}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error('Нужно войти, чтобы жаловаться.');
      if (!r.ok || j?.ok === false) throw new Error(j?.message || `HTTP ${r.status}`);

      // если бэкенд вернул is_hidden — применим локально
      const hidden = (j && j.item && typeof j.item.is_hidden === 'boolean') ? j.item.is_hidden : j?.is_hidden;
if (typeof hidden === 'boolean') {
  setItems(prev => prev.map(it => it.id === commentId ? { ...it, is_hidden: hidden } : it));
}
      setReporting((m) => ({ ...m, [commentId]: 'sent' }));
    } catch (e: any) {
      alert(e?.message || 'Не удалось отправить жалобу');
      setReporting((m) => ({ ...m, [commentId]: 'error' }));
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 dark:border-white/10 bg-transparent">
      <h3 className="px-4 pt-4 text-lg font-semibold">Комментарии к странице</h3>

      {/* Панель + редактор — неактивные (read-only) */}
      <div className="mx-4 my-3 rounded-xl bg-slate-900 text-slate-100 p-3">
        <div className="mb-2 flex gap-2 flex-wrap">
          <button onClick={() => exec('bold')} disabled className="px-3 py-1 rounded bg-white/10 inline-flex items-center gap-2 opacity-50">
            <Bold className="w-4 h-4" /><span>Жирный</span>
          </button>
          <button onClick={() => exec('italic')} disabled className="px-3 py-1 rounded bg-white/10 inline-flex items-center gap-2 opacity-50">
            <Italic className="w-4 h-4" /><span>Курсив</span>
          </button>
          <button onClick={() => exec('underline')} disabled className="px-3 py-1 rounded bg-white/10 inline-flex items-center gap-2 opacity-50">
            <Underline className="w-4 h-4" /><span>Подчёркнуть</span>
          </button>
          <button onClick={() => exec('strikeThrough')} disabled className="px-3 py-1 rounded bg-white/10 inline-flex items-center gap-2 opacity-50">
            <Strikethrough className="w-4 h-4" /><span>Зачеркнуть</span>
          </button>
        </div>

        <div className="relative">
          {isEmpty && (
            <span className="pointer-events-none absolute left-3 top-3 text-sm text-slate-400">
              Добавление комментариев временно отключено
            </span>
          )}
          <div
            ref={editorRef}
            role="textbox"
            aria-label="Поле ввода комментария"
            contentEditable={false}
            suppressContentEditableWarning
            className="min-h-[64px] rounded-lg bg-slate-800/30 p-3 outline-none cursor-not-allowed"
            onInput={updateEmpty}
          />
        </div>

        <div className="mt-2 flex justify-end">
          <button
            onClick={trySend}
            className="px-4 py-2 rounded bg-indigo-500 opacity-60 cursor-not-allowed"
            disabled
          >
            Отправить
          </button>
        </div>
      </div>

      {/* Список */}
      <div className="px-4 pb-4 space-y-5">
        {loading && <div className="text-sm opacity-70">Загрузка…</div>}
        {!loading && items.length === 0 && <div className="text-sm opacity-70">Пока нет комментариев — будьте первым!</div>}
        {items.map(m => {
          const state = reporting[m.id] ?? 'idle';
          return (
            <div key={m.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs opacity-60">
                  {new Date(m.created_at).toLocaleString('ru-RU', { hour12: false })}
                </div>

                {m.is_hidden ? (
                  <div className="mt-1 text-sm italic px-3 py-2 rounded bg-amber-500/10 border border-amber-400/30 text-amber-300">
                    Комментарий скрыт жалобами и ожидает решения модерации
                  </div>
                ) : (
                  <div
                    className="mt-1 text-[15px] leading-relaxed break-words prose-invert"
                    dangerouslySetInnerHTML={{ __html: m.content }}
                  />
                )}

                <div className="mt-1">
                  <button
                    onClick={() => report(m.id)}
                    disabled={state !== 'idle'}
                    className="inline-flex items-center gap-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-60"
                    title="Пожаловаться"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {state === 'sent' ? 'Жалоба отправлена' : state === 'sending' ? 'Отправка…' : 'Пожаловаться'}
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
