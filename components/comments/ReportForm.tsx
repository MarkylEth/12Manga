'use client';

import { useEffect, useState } from 'react';
import { Flag, X } from 'lucide-react';

type ReportReason =
  | 'abuse' | 'harassment' | 'spam' | 'hate' | 'porn'
  | 'illegal_trade' | 'spoiler' | 'offtopic' | 'other';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'abuse',         label: 'Оскорбления' },
  { value: 'harassment',    label: 'Травля/домогательства' },
  { value: 'spam',          label: 'Спам/реклама' },
  { value: 'hate',          label: 'Ненависть/дискриминация' },
  { value: 'porn',          label: '18+ контент' },
  { value: 'illegal_trade', label: 'Незаконная торговля' },
  { value: 'spoiler',       label: 'Спойлеры' },
  { value: 'offtopic',      label: 'Офтоп' },
  { value: 'other',         label: 'Другое' },
];

export default function ReportForm({
  mangaId,
  commentId,
  onDone,
}: { mangaId: number; commentId: string; onDone?: (hidden: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('abuse');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Закрытие по ESC + блокировка скролла при открытии
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function submit() {
    if (state === 'sending') return;
    setState('sending');
    try {
      const r = await fetch(`/api/manga/${mangaId}/comments/${commentId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason, note }),
      });

      if (r.status === 401) {
        setState('idle');
        setOpen(false);
        alert('Нужно войти, чтобы отправлять жалобы.');
        return;
      }

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || j?.ok === false) throw new Error(j?.message || `HTTP ${r.status}`);

      setState('sent');
      setOpen(false);
      onDone?.(!!j?.is_hidden);
    } catch (e: any) {
      setState('error');
      alert(e?.message || 'Не удалось отправить жалобу');
    }
  }

  return (
    <>
      <button
        type="button"
        className="text-xs opacity-70 hover:opacity-100 inline-flex items-center gap-1"
        onClick={() => setOpen(true)}
        disabled={state === 'sending'}
        title="Пожаловаться"
      >
        <Flag className="w-3.5 h-3.5" />
        {state === 'sent' ? 'Жалоба отправлена' : state === 'sending' ? 'Отправка…' : 'Пожаловаться'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onMouseDown={() => setOpen(false)} // клик по фону
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm"
            onMouseDown={(e) => e.stopPropagation()} // не закрывать при клике внутри
          >
            <div className="rounded-2xl border border-white/10 bg-white text-black shadow-xl dark:bg-zinc-900 dark:text-white">
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 dark:border-white/10">
                <h3 className="text-base font-semibold">Пожаловаться на комментарий</h3>
                <button
                  className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4">
                <label className="block text-xs opacity-70 mb-1">Причина</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReportReason)}
                  className="w-full text-sm rounded border border-black/20 dark:border-white/15 bg-white dark:bg-zinc-950 px-2 py-1 mb-3"
                >
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>

                <label className="block text-xs opacity-70 mb-1">Комментарий (необязательно)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Опишите подробности…"
                  className="w-full text-sm rounded border border-black/20 dark:border-white/15 bg-white dark:bg-zinc-950 px-2 py-1"
                />

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    className="text-sm px-3 py-1 rounded border border-black/20 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => setOpen(false)}
                  >
                    Отмена
                  </button>
                  <button
                    className="text-sm px-3 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    onClick={submit}
                    disabled={state === 'sending'}
                  >
                    Отправить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
