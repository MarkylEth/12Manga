// app/add-title/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/theme/context';
import { Header } from '@/components/Header';
import SubmitTitleForm from '@/components/SubmitTitleForm';

export default function AddTitlePage() {
  const { theme } = useTheme();
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);

  const pageBg =
    theme === 'light'
      ? 'bg-gray-50 text-gray-900'
      : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-100';

  return (
    <div className={`min-h-screen ${pageBg}`}>
      <Header showSearch={false} />

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <h1
            className={`mb-2 text-3xl font-bold ${
              theme === 'light' ? 'text-gray-900' : 'text-white'
            }`}
          >
            Добавить новый тайтл
          </h1>
          <p
            className={`mb-6 ${
              theme === 'light' ? 'text-gray-600' : 'text-gray-300'
            }`}
          >
            Предложите новую мангу для каталога. Заявка уйдёт на модерацию.
            Авторизация временно не требуется.
          </p>

          {!submitted ? (
            <SubmitTitleForm />
          ) : (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-200">
              Заявка отправлена! Спасибо.{' '}
              <button
                onClick={() => router.push('/')}
                className="underline hover:no-underline"
              >
                Вернуться на главную
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
