'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/** Минимальные типы; сохраняем совместимость с любым беком */
export type UserLike =
  | { id: string; email?: string | null; name?: string | null; [k: string]: any }
  | null;

export type ProfileLike =
  | {
      id?: string;
      username?: string | null;
      full_name?: string | null;
      avatar_url?: string | null;
      role?: string | null;
      [k: string]: any;
    }
  | null;

type AuthErrorLike = { message: string } | null;

interface AuthContextType {
  user: UserLike;
  profile: ProfileLike;
  loading: boolean;         // загрузка во время signIn/signUp/signOut
  initialLoading: boolean;  // первичная проверка сессии при монтировании
  signIn: (email: string, password: string) => Promise<{ error: AuthErrorLike }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthErrorLike }>;
  signOut: () => Promise<{ error: AuthErrorLike }>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------
// helpers
// ---------------------------------------------------------------

async function fetchJSON<T = any>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      credentials: 'include', // важно для httpOnly cookie
      cache: 'no-store',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (data?.message as string) ||
        (data?.error as string) ||
        `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserLike>(null);
  const [profile, setProfile] = useState<ProfileLike>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const loadMe = async () => {
    setInitialLoading(true);
    // Берём user+profile c /api/profile (ваш роут как раз их возвращает)
    const r = await fetchJSON<any>('/api/profile');
    if (r.ok && (r.data as any)?.ok) {
      const d: any = r.data;
      setUser(d.user ?? null);
      setProfile(d.profile ?? null);
    } else {
      setUser(null);
      setProfile(null);
    }
    setInitialLoading(false);
  };

  useEffect(() => {
    // первичная проверка сессии
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn: AuthContextType['signIn'] = async (email, password) => {
    setLoading(true);
    const r = await fetchJSON('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      setLoading(false);
      return { error: { message: r.error || 'Login failed' } };
    }
    await loadMe(); // cookie установилась — подтянем текущего пользователя
    setLoading(false);
    return { error: null };
  };

  const signUp: AuthContextType['signUp'] = async (email, password, fullName) => {
    setLoading(true);
    // Если у вас есть роут регистрации — используйте его.
    const r = await fetchJSON('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name: fullName }),
    });

    if (!r.ok) {
      setLoading(false);
      return { error: { message: r.error || 'Registration failed' } };
    }
    // Многие бекенды сразу логинят после регистрации; если нет — можно вызвать signIn.
    await loadMe();
    setLoading(false);
    return { error: null };
  };

  const signOut: AuthContextType['signOut'] = async () => {
    setLoading(true);
    await fetchJSON('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setProfile(null);
    setLoading(false);
    return { error: null };
  };

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      profile,
      loading,
      initialLoading,
      signIn,
      signUp,
      signOut,
      refresh: loadMe,
    }),
    [user, profile, loading, initialLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
