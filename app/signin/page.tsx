'use client';

import { signIn } from 'next-auth/react';

export default function SignInPage() {
  return (
    <div className="mx-auto mt-12 max-w-md rounded-2xl border p-6">
      <h1 className="text-2xl font-semibold">Вход</h1>
      <p className="mt-2 text-sm opacity-70">
        Используйте аккаунт Google, почта отключена.
      </p>

      <button
        type="button"
        onClick={() => signIn('google', { callbackUrl: '/' })}
        className="mt-6 inline-flex items-center gap-2 rounded-lg border px-4 py-2 hover:bg-black/5"
      >
        {/* иконка (по желанию) */}
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
          <path d="M21.35 11.1H12v2.9h5.3a5.7 5.7 0 1 1-2.4-6.9l2-2A8.999 8.999 0 1 0 21 12c0-.3 0-.6-.05-.9h.4Z" />
        </svg>
        Войти через Google
      </button>
    </div>
  );
}
