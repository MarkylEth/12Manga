'use client';

import { useEffect, useMemo, useState } from 'react';
import { CornerDownRight, Pin, Flag } from 'lucide-react';

type CommentItem = {
  id: string;
  content: string;
  created_at: string;
  user_id: string | null;
  parent_id?: string | null;
  is_team_comment?: boolean;
  team_id?: number | null;
  is_pinned?: boolean;
  is_hidden?: boolean;             // <— добавили
  reports_count?: number | null;   // <— опционально
  profile?: { username?: string; avatar_url?: string } | null;
  team?: { id: number; name: string; avatar_url?: string | null } | null;
};

export default function MangaComments({ mangaId }: { mangaId: number }) {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);

  // локальный статус жалоб по id
  const [reporting, setReporting] = useState<Record<string, 'idle'|'sending'|'sent'|'error'>>({});

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/manga/${mangaId}/comments`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!stop) setItems(Array.isArray(j.items) ? j.items : []);
      } catch {
        if (!stop) setItems([]);
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [mangaId]);

  const roots = useMemo(() => items.filter(c => !c.parent_id), [items]);
  const childrenMap = useMemo(() => {
    const map: Record<string, CommentItem[]> = {};
    for (const c of items) if (c.parent_id) (map[c.parent_id] ||= []).push(c);
    return map;
  }, [items]);

  async function report(commentId: string) {
    setReporting((m) => ({ ...m, [commentId]: 'sending' }));
    try {
      const r = await fetch(`/api/manga/${mangaId}/comments/${encodeURIComponent(commentId)}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error('Нужно войти, чтобы жаловаться.');
      if (!r.ok || j?.ok === false) throw new Error(j?.message || `HTTP ${r.status}`);

      const hidden = (j && j.item && typeof j.item.is_hidden === 'boolean') ? j.item.is_hidden : j?.is_hidden;
if (typeof hidden === 'boolean') {
  setItems(prev => prev.map(it => it.id === commentId ? { ...it, is_hidden: hidden } : it));
}
      setReporting((m) => ({ ...m, [commentId]: 'sent' }));
    } catch (e: any) {
      alert(e?.message || 'Не удалось отправить жалобу');
      setReporting((m) => ({ ...m, [commentId]: 'error' }));
    }
  }

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
            const replies = (childrenMap[c.id] || []).slice();
            const isTeam = c.is_team_comment && c.team_id != null;
            const displayName = isTeam ? (c.team?.name ?? 'Команда') : (c.profile?.username ?? 'Пользователь');
            const avatarUrl = isTeam ? c.team?.avatar_url ?? null : c.profile?.avatar_url ?? null;
            const initials =
              (isTeam ? c.team?.name?.[0] : c.profile?.username?.[0])?.toUpperCase() ?? '?';

            const state = reporting[c.id] ?? 'idle';

            return (
              <article
                key={c.id}
                className={`w-full rounded-xl border p-4 ${
                  c.is_pinned
                    ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-400/20'
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
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                      <Pin className="h-3 w-3" /> Закреплено
                    </span>
                  )}
                </header>

                {c.is_hidden ? (
                  <div className="mt-3 text-sm italic px-3 py-2 rounded bg-amber-500/10 border border-amber-400/30 text-amber-300">
                    Комментарий скрыт жалобами и ожидает решения модерации
                  </div>
                ) : (
                  <div
                    className="mt-3 text-sm leading-relaxed break-words"
                    dangerouslySetInnerHTML={{ __html: c.content }}
                  />
                )}

                <div className="mt-2">
                  <button
                    onClick={() => report(c.id)}
                    disabled={state !== 'idle'}
                    className="inline-flex items-center gap-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-60"
                    title="Пожаловаться"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    {state === 'sent' ? 'Жалоба отправлена' : state === 'sending' ? 'Отправка…' : 'Пожаловаться'}
                  </button>
                </div>

                {replies.length > 0 && (
                  <div className="ml-6 mt-3 border-l pl-4 border-black/10 dark:border-white/10">
                    <div className="space-y-3">
                      {replies.map((r) => {
                        const rTeam = r.is_team_comment && r.team_id != null;
                        const rName = rTeam ? (r.team?.name ?? 'Команда') : (r.profile?.username ?? 'Пользователь');
                        const rState = reporting[r.id] ?? 'idle';
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

                            {r.is_hidden ? (
                              <div className="mt-1 text-sm italic px-3 py-2 rounded bg-amber-500/10 border border-amber-400/30 text-amber-300">
                                Комментарий скрыт жалобами
                              </div>
                            ) : (
                              <div
                                className="mt-1 text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: r.content }}
                              />
                            )}

                            <div className="mt-1">
                              <button
                                onClick={() => report(r.id)}
                                disabled={rState !== 'idle'}
                                className="inline-flex items-center gap-1 text-[11px] opacity-80 hover:opacity-100 disabled:opacity-60"
                                title="Пожаловаться"
                              >
                                <Flag className="h-3 w-3" />
                                {rState === 'sent' ? 'Жалоба отправлена' : rState === 'sending' ? 'Отправка…' : 'Пожаловаться'}
                              </button>
                            </div>
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
