'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function VerifiedPage() {
  const sp = useSearchParams();
  const uid = sp.get('uid') ?? '';

  // авто-редирект через 5 сек.
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = '/';
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm text-center">
        <h1 className="text-2xl font-semibold">Почта подтверждена ✅</h1>
        <p className="mt-2 text-sm text-gray-600">
          Спасибо! Ваш адрес успешно подтверждён.
          {uid && (
            <>
              <br />ID пользователя: <span className="font-mono">{uid}</span>
            </>
          )}
        </p>

        <div className="mt-6 space-x-2">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            На главную
          </Link>
          <Link
            href="/profile"
            className="inline-flex items-center rounded-lg border px-4 py-2 hover:bg-gray-50"
          >
            Профиль
          </Link>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Автоматический переход через 5 секунд…
        </p>
      </div>
    </main>
  );
}
