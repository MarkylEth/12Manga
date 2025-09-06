// components/AuthModal.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
};

type ApiError = { ok: false; error?: string; detail?: any; message?: string };

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = 'register',
}: Props) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Сброс при закрытии
  useEffect(() => {
    if (!isOpen) {
      setMsg(null);
      setErr(null);
      setLoading(false);
      setPassword('');
    }
  }, [isOpen]);

  // Синхронизируем внешний initialMode
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Закрытие по ESC
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const disabled = useMemo(() => {
    if (loading) return true;
    if (!email) return true;
    if (mode === 'register' && (!nickname || password.length < 6)) return true;
    if (mode === 'login' && password.length < 1) return true;
    return false;
  }, [loading, email, nickname, password, mode]);

  if (!isOpen) return null;

  async function handleRegister() {
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: nickname,
          password,
          mode: 'signup',
        }),
      });

      const json = await r.json();
      if (!r.ok || !json?.ok) {
        const j = json as ApiError;
        const nice =
  j.detail?.message ||
  j.detail?.error ||
  (typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)) ||
  j.message || j.error || `HTTP ${r.status}`;

          j.error ||
          `HTTP ${r.status}`;
        setErr(nice);
        return;
      }
      setMsg(
        'Письмо отправлено. Проверьте почту и перейдите по ссылке для подтверждения.'
      );
    } catch (e: any) {
      setErr(e?.message || 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setErr(json?.error || `HTTP ${r.status}`);
        return;
      }
      setMsg('Успешный вход');
      // закрыть модалку и обновить страницу / стейт
      setTimeout(() => window.location.reload(), 400);
    } catch (e: any) {
      setErr(e?.message || 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  }

  // submit по Enter
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    if (mode === 'register') await handleRegister();
    else await handleLogin();
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-md rounded-2xl border bg-white p-5 shadow-xl dark:bg-slate-900 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold dark:text-white">
            {mode === 'register' ? 'Регистрация по e-mail' : 'Вход'}
          </h3>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode('login')}
            className={`rounded px-3 py-2 text-sm ${
              mode === 'login'
                ? 'bg-blue-600 text-white'
                : 'border dark:border-slate-700 dark:text-slate-200'
            }`}
          >
            Вход
          </button>
          <button
            onClick={() => setMode('register')}
            className={`rounded px-3 py-2 text-sm ${
              mode === 'register'
                ? 'bg-blue-600 text-white'
                : 'border dark:border-slate-700 dark:text-slate-200'
            }`}
          >
            Регистрация
          </button>
        </div>

        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-white">
              E-mail
            </label>
            <input
              type="email"
              autoComplete="email"
              className="w-full rounded-lg border px-3 py-2 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          {mode === 'register' ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-white">
                  Ник
                </label>
                <input
                  autoComplete="nickname"
                  className="w-full rounded-lg border px-3 py-2 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Ваш ник"
                  maxLength={32}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 dark:text-white">
                  Пароль
                </label>
                <input
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-lg border px-3 py-2 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  required
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-white">
                Пароль
              </label>
              <input
                type="password"
                autoComplete="current-password"
                className="w-full rounded-lg border px-3 py-2 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ваш пароль"
                required
              />
            </div>
          )}

          {!!err && <p className="text-sm text-red-600">{err}</p>}
          {!!msg && <p className="text-sm text-green-600">{msg}</p>}

          <button
            type="submit"
            disabled={disabled}
            className={`w-full rounded-lg py-2 text-white ${
              disabled ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading
              ? 'Отправка…'
              : mode === 'register'
              ? 'Зарегистрироваться'
              : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
