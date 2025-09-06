'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CornerDownRight, Pin } from 'lucide-react';
import Link from 'next/link';

type Profile = { id: string; username?: string | null; avatar_url?: string | null };
type Team = { id: number; name: string; slug?: string | null; avatar_url?: string | null };
type RawComment = {
  id: string;
  manga_id: number;
  user_id: string | null;
  created_at: string;
  comment: string; // HTML
  parent_id?: string | null;
  is_team_comment?: boolean | null;
  team_id?: number | null;
  is_pinned?: boolean | null;
  profile?: Profile | null;
  team?: Team | null;
};

export default function TitleComments({ mangaId }: { mangaId: number }) {
  const [items, setItems] = useState<RawComment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/manga/${mangaId}/comments`, { cache: 'no-store' });
        const js = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(js?.error || `HTTP ${res.status}`);
        if (!cancelled) setItems(Array.isArray(js?.items) ? js.items : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mangaId]);

  const roots = useMemo(() => items.filter((c) => !c.parent_id), [items]);
  const childrenMap = useMemo(() => {
    const map: Record<string, RawComment[]> = {};
    for (const c of items) if (c.parent_id) (map[c.parent_id] ||= []).push(c);
    return map;
  }, [items]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-black/10 dark:border-white/10">
        <div className="p-4 text-center">Загрузка комментариев…</div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-black/10 dark:border-white/10">
      <div className="flex items-center justify-between px-4 pt-4">
        <h3 className="text-lg font-semibold">Комментарии</h3>
        <div className="text-xs opacity-70">Добавление временно отключено</div>
      </div>

      <div className="px-4 pb-4 space-y-4">
        {roots.length === 0 && <div className="text-sm opacity-70">Пока нет комментариев</div>}

        {roots
          .slice()
          .sort((a, b) => {
            const pa = a.is_pinned ? 1 : 0;
            const pb = b.is_pinned ? 1 : 0;
            if (pa !== pb) return pb - pa;
            return +new Date(a.created_at) - +new Date(b.created_at);
          })
          .map((c) => {
            const replies = (childrenMap[c.id] ?? []).slice();
            const isTeam = c.is_team_comment && c.team_id != null;
            const displayName = isTeam ? (c.team?.name ?? 'Команда') : (c.profile?.username ?? 'Пользователь');
            const avatarUrl = isTeam ? c.team?.avatar_url ?? null : c.profile?.avatar_url ?? null;
            const initials = (isTeam ? c.team?.name?.[0] : c.profile?.username?.[0])?.toUpperCase() ?? '?';

            return (
              <article
                key={c.id}
                className={`w-full rounded-xl border p-4 ${
                  c.is_pinned
                    ? 'bg-sky-50 border-sky-200 dark:bg-amber-900/20 dark:border-amber-400/20'
                    : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700'
                }`}
              >
                <header className="flex items-center gap-3">
                  <div className="h-9 w-9 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 text-xs flex items-center justify-center">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{displayName}</div>
                    <div className="text-xs opacity-60">{new Date(c.created_at).toLocaleString('ru-RU')}</div>
                  </div>
                  {c.is_pinned && (
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-sky-700 dark:text-amber-300">
                      <Pin className="h-3 w-3" /> Закреплено
                    </span>
                  )}
                </header>

                <div className="mt-3 text-sm leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: c.comment }} />

                {replies.length > 0 && (
                  <div className="ml-6 mt-3 border-l pl-4 border-black/10 dark:border-white/10">
                    <div className="space-y-3">
                      {replies.map((r) => {
                        const rTeam = r.is_team_comment && r.team_id != null;
                        const rName = rTeam ? (r.team?.name ?? 'Команда') : (r.profile?.username ?? 'Пользователь');
                        return (
                          <div key={r.id} className="rounded-lg p-3 bg-gray-50 dark:bg-gray-700/50">
                            <div className="flex items-center gap-2">
                              <div className="text-xs font-medium">{rName}</div>
                              <div className="text-[11px] opacity-60">
                                {new Date(r.created_at).toLocaleString('ru-RU')}
                              </div>
                              <div className="ml-auto inline-flex items-center gap-1 text-[11px] opacity-70">
                                <CornerDownRight className="h-3 w-3" />
                                Ответ
                              </div>
                            </div>
                            <div className="mt-1 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: r.comment }} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
      </div>
    </section>
  );
}
