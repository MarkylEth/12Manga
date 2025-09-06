'use client';

import React from 'react';

type AuthLoaderProps = {
  children: React.ReactNode;
  /** Показать лоадер вместо контента */
  loading?: boolean;
  /** Текст под спиннером */
  text?: string;
  /** Показать кнопку «Выйти» над контентом */
  showSignOut?: boolean;
  /** Коллбек после выхода (например, закрыть модалку) */
  onSignOut?: () => void;
  className?: string;
};

/**
 * Упрощённый лоадер + (опционально) кнопка «Выйти».
 */
export default function AuthLoader({
  children,
  loading = false,
  text = 'Загрузка…',
  showSignOut = false,
  onSignOut,
  className,
}: AuthLoaderProps) {
  if (loading) {
    return (
      <div className="grid place-items-center p-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <p className="mt-2 text-sm opacity-70">{text}</p>
      </div>
    );
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      onSignOut?.();
      window.location.reload();
    }
  }

  return (
    <div className={className}>
      {showSignOut && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700"
          >
            Выйти
          </button>
        </div>
      )}
      {children}
    </div>
  );
}