'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export type AuthUser = {
  id: number;
  email: string;
  username: string;
  emailVerified: boolean;
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void checkAuth(); }, []);

  async function checkAuth() {
    try {
      setLoading(true);
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setError('Ошибка проверки авторизации');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setUser(data.user);
      return { success: true };
    }
    setError(data.error || 'Ошибка входа');
    return { success: false, error: data.error };
  }

  async function register(email: string, password: string, username: string) {
    setError(null);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, username }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setUser(data.user);
      return { success: true };
    }
    setError(data.error || 'Ошибка регистрации');
    return { success: false, error: data.error };
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  }

  return { user, loading, error, login, register, logout, checkAuth };
}

export function AuthGuard({
  children,
  requireAdmin = false,
  fallback,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  fallback?: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    if (requireAdmin) {
      const admins = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (!admins.includes(user.email)) router.push('/403');
    }
  }, [loading, user, requireAdmin, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!user) return fallback ?? <div>Перенаправление…</div>;
  if (requireAdmin) {
    const admins = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(s => s.trim());
    if (!admins.includes(user.email)) return <div>Недостаточно прав</div>;
  }
  return <>{children}</>;
}
