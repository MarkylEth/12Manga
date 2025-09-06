'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';

export type MangaSubmissionModalProps = {
  /** Сторонний триггер (кнопка и т.п.). Если передан — модалка откроется по клику на него */
  trigger?: React.ReactNode;
  /** Показать встроенную кнопку-триггер (по умолчанию скрыто) */
  showDefaultTrigger?: boolean;
  /** Управляемое открытие */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function MangaSubmissionModal({
  trigger,
  showDefaultTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: MangaSubmissionModalProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  function setOpenState(v: boolean) {
    if (isControlled) onOpenChange?.(v);
    else setUncontrolledOpen(v);
  }

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const payload = {
        type: 'title_add',
        title_ru: title.trim(),
        comment: message.trim() || null,
      };

      if (!payload.title_ru) {
        throw new Error('Укажите название');
      }

      // Публичный эндпоинт: сервер пойдёт в Neon и создаст черновик заявки
      const res = await fetch('/api/title-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      setOk(true);
      setTitle('');
      setMessage('');
      // Можно оставить модалку открытой с сообщением «отправлено»
      // или автоматически закрывать:
      // setOpenState(false);
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить заявку');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Триггер: внешний (если передали) или встроенный (если явно включили) */}
      {trigger ? (
        <span onClick={() => setOpenState(true)} className="inline-block cursor-pointer">
          {trigger}
        </span>
      ) : showDefaultTrigger ? (
        <button
          type="button"
          onClick={() => setOpenState(true)}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/10"
        >
          Предложить мангу
        </button>
      ) : null}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpenState(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border bg-white text-gray-900 shadow-xl dark:border-white/10 dark:bg-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b px-4 py-3 dark:border-white/10">
              <div className="font-semibold">Предложить мангу</div>
              <button
                onClick={() => setOpenState(false)}
                className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              {ok && (
                <div className="rounded-lg border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  Заявка отправлена. Спасибо!
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {error}
                </div>
              )}

              <label className="block text-sm">
                <span className="mb-1 block opacity-70">Название (русское)</span>
                <input
                  className="w-full rounded border px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Название"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block opacity-70">Сообщение модераторам (опционально)</span>
                <textarea
                  className="min-h-[100px] w-full rounded border px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ссылки/комментарии"
                />
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpenState(false)}
                  className="rounded border px-3 py-2 text-sm dark:border-white/10"
                  disabled={busy}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={submit}
                  className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
                  disabled={busy}
                >
                  {busy ? 'Отправка…' : 'Отправить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MangaSubmissionModal;
