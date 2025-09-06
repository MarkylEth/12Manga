'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Send } from 'lucide-react';
import Header from '@/components/Header';
import { useTheme } from '@/lib/theme/context';
import { useRouter } from 'next/navigation';

/* =================== Types =================== */
type UserType = { full_name?: string | null; avatar_url?: string | null };

type Message = {
  id: number; chat_id: number; user_id: string; body: string;
  kind?: string; created_at: string; edited_at?: string | null;
  reply_to_id?: number | null;
  user?: UserType;
  reply_to?: {
    id: number; user_id: string; body: string; created_at: string;
    user?: { full_name?: string | null; avatar_url?: string | null };
  } | null;
};

type Member = { user_id: string; role: string; full_name?: string | null; avatar_url?: string | null };

type ChatWindowProps = {
  chatId: number; currentUserId?: string; chatInfo?: {
    id: number; type: 'dm' | 'group'; title?: string; members?: Member[];
  };
};

type Conversation = {
  chat_id: number;
  type: 'dm' | 'group';
  title: string;
  peer: null | { id: string | null; full_name: string | null; avatar_url: string | null };
  last: null | { id: number; user_id: string; body: string; created_at: string };
  unread: number;
};

/* =================== Component =================== */
export default function ChatWindow({ chatId, currentUserId, chatInfo }: ChatWindowProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const router = useRouter();

  // ===== Theme tokens =====
  const shellBg = isLight ? 'bg-gray-50 text-gray-900' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-100';
  const cardSurface = isLight ? 'bg-white border border-gray-200' : 'bg-gray-900/40 border border-white/10';
  const sidebarSurface = isLight ? 'bg-white' : 'bg-black/20';
  const searchBox = isLight ? 'bg-gray-100 text-gray-700 placeholder-gray-500' : 'bg-white/5 text-white placeholder-white/40';
  const divider = isLight ? 'bg-gray-200' : 'bg-white/10';
  const muted = isLight ? 'text-gray-500' : 'text-white/50';
  const title = isLight ? 'text-gray-900' : 'text-white';
  const bubbleOther = isLight ? 'bg-gray-100 ring-gray-200 text-gray-900' : 'bg-white/5 ring-white/10 text-white/90';
  const bubbleMe    = isLight ? 'bg-slate-900 ring-black/10 text-white' : 'bg-indigo-500/15 ring-indigo-400/30 text-indigo-50';
  const quickBtn    = isLight ? 'bg-black/5 hover:bg-black/10 ring-1 ring-black/10 text-gray-700' : 'bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-white/70';
  const inputWrap   = isLight ? 'bg-gray-100 ring-1 ring-gray-300 focus-within:ring-gray-400' : 'bg-white/5 ring-1 ring-white/10 focus-within:ring-white/20';
  const inputText   = isLight ? 'text-gray-900 placeholder-gray-500' : 'text-white placeholder-white/40';
  const sendBtn     = isLight ? 'bg-slate-900 hover:bg-slate-800 text-white' : 'bg-indigo-500 hover:bg-indigo-600 text-white';
  const sendBtnDisabled = isLight ? 'bg-gray-300 text-white' : 'bg-white/15 text-white/70';
  const replyChip   = isLight ? 'bg-white ring-gray-200' : 'bg-white/5 ring-white/10';

  /* ===== State ===== */
  const [messages, setMessages] = useState<Message[]>([]);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // header height
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState<number>(64);
  useEffect(() => {
    const el = headerRef.current;
    const measure = () => setHeaderH(el?.offsetHeight ?? 64);
    measure();
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ===== Helpers ===== */
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const markAsRead = useCallback(async (messageId: number) => {
    try {
      await fetch(`/api/chats/${chatId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lastMessageId: messageId }),
      });
      setConvos(prev => prev.map(c => c.chat_id === chatId ? { ...c, unread: 0 } : c));
    } catch {}
  }, [chatId]);

  const formatMessageTime = useCallback((iso: string) => {
    const d = new Date(iso); const now = new Date();
    return (d.toDateString() === now.toDateString())
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }, []);

  const handleTyping = useCallback(() => {
    fetch(`/api/chats/${chatId}/typing`, { method: 'POST', credentials: 'include' }).catch(() => {});
  }, [chatId]);

  const textSnippet = (s: string, n = 120) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  /* ===== Список диалогов ===== */
  const loadConvos = useCallback(async () => {
    try {
      const r = await fetch('/api/chats/list', { credentials: 'include' });
      const data = await r.json();
      if (data?.ok) setConvos(data.items as Conversation[]);
    } catch {}
  }, []);
  useEffect(() => { loadConvos(); }, [loadConvos]);

  /* ===== Initial messages ===== */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(`/api/chats/${chatId}/messages?limit=50`, { cache: 'no-store', credentials: 'include' });
        if (!r.ok) throw new Error(`Failed to load messages: ${r.status}`);
        const data = await r.json();
        if (!mounted) return;
        if (!data.ok) throw new Error(data.message || 'Failed to load messages');
        const items: Message[] = data.items || []; // API уже отдаёт по возрастанию
        setMessages(items);
        if (items.length) {
          markAsRead(items[items.length - 1].id);
          setTimeout(scrollToBottom, 50);
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load messages');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [chatId, markAsRead, scrollToBottom]);

  /* ===== SSE ===== */
  useEffect(() => {
    if (!chatId) return;
    const setup = () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      const es = new EventSource(`/api/chats/${chatId}/sse`);
      eventSourceRef.current = es;

      es.addEventListener('connected', () => { setConnected(true); setError(null); });

      es.addEventListener('message:new', (ev) => {
        try {
          const msg = JSON.parse(ev.data) as Message;

          // не добавляем дубликаты
          setMessages(prev => {
            if (prev.some(x => x.id === msg.id)) return prev;
            return [...prev, msg]; // новые — в конец
          });

          if (msg.user_id !== currentUserId) markAsRead(msg.id);
          requestAnimationFrame(scrollToBottom);
        } catch {}
      });

      es.addEventListener('typing:start', (ev) => {
        try {
          const { userId } = JSON.parse(ev.data);
          if (userId !== currentUserId) setTypingUsers(prev => new Set([...prev, userId]));
        } catch {}
      });

      es.addEventListener('typing:stop', (ev) => {
        try {
          const { userId } = JSON.parse(ev.data);
          setTypingUsers(prev => { const s = new Set(prev); s.delete(userId); return s; });
        } catch {}
      });

      es.onerror = () => {
        setConnected(false);
        setTimeout(() => {
          if (eventSourceRef.current?.readyState !== EventSource.OPEN) setup();
        }, 2000);
      };
    };

    setup();
    return () => {
      if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
      setConnected(false);
    };
  }, [chatId, currentUserId, markAsRead, scrollToBottom, loadConvos]);

  /* ===== Open / find DM and navigate ===== */
  const openDM = useCallback(async (userId: string) => {
    if (!userId || userId === currentUserId) return;
    try {
      const r = await fetch('/api/chats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ type: 'dm', userId }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok || !data?.chatId) throw new Error(data?.message || 'Не удалось открыть диалог');
      router.push(`/messages/${data.chatId}`);
    } catch (e: any) {
      setError(e?.message || 'Ошибка открытия диалога');
    }
  }, [router, currentUserId]);

  /* ===== Reply ===== */
  const handleReply = useCallback((msg: Message) => {
    setReplyTarget(msg);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const cancelReply = useCallback(() => setReplyTarget(null), []);

  /* ===== Send ===== */
  const sendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;

    setSending(true);
    setText('');

    const tempId = -Math.floor(Math.random() * 1e9);
    const optimistic: Message = {
      id: tempId, chat_id: chatId, user_id: currentUserId || '', body: t,
      created_at: new Date().toISOString(), kind: 'text', user: {},
      reply_to_id: replyTarget?.id ?? undefined,
      reply_to: replyTarget
        ? {
            id: replyTarget.id,
            user_id: replyTarget.user_id,
            body: replyTarget.body,
            created_at: replyTarget.created_at,
            user: replyTarget.user
          }
        : undefined
    };

    setMessages(prev => [...prev, optimistic]);
    scrollToBottom();

    try {
      const r = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: t, reply_to_id: replyTarget?.id ?? null, replyToId: replyTarget?.id ?? null }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data?.message || `Failed: ${r.status}`);

      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempId);
        if (filtered.some(m => m.id === data.message.id)) return filtered;
        return [...filtered, data.message];
      });

      setReplyTarget(null);
      inputRef.current?.focus();
      setTimeout(scrollToBottom, 30);
    } catch (e: any) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setText(t);
      setError(e?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [text, sending, chatId, currentUserId, scrollToBottom, replyTarget]);

  const titleText = chatInfo?.title || (chatInfo?.type === 'dm' ? 'Диалог' : `Чат ${chatId}`);

  if (loading) {
    return (
      <>
        <div ref={headerRef}><Header showSearch={false} /></div>
        <div className={`fixed inset-x-0 bottom-0 flex items-center justify-center ${shellBg}`} style={{ top: headerH }}>
          <div className={muted}>Загрузка чата…</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div ref={headerRef}><Header showSearch={false} /></div>

      <div className={`fixed inset-x-0 bottom-0 ${shellBg} overflow-hidden`} style={{ top: headerH }}>
        <div className="h-full max-w-6xl mx-auto px-4 sm:px-6">
          <div className={`h-full rounded-3xl overflow-hidden shadow-2xl ${cardSurface}`}>
            <div className="grid grid-cols-[300px_1fr] grid-rows-[64px_minmax(0,1fr)_auto] h-full">
              <TopBar
                className="col-span-2 row-[1]"
                title={titleText}
                subtitle={chatInfo?.type === 'group' ? 'Групповой чат' : 'Личные сообщения'}
                connected={connected}
                titleClass={title}
                mutedClass={muted}
              />

              {/* Sidebar: поиск/диалоги */}
              <aside className={`col-[1] row-[2/4] min-h-0 overflow-y-auto border-r ${isLight ? 'border-gray-200' : 'border-white/10'} ${sidebarSurface}`}>
                <div className="p-3 sticky top-0 bg_black/0 backdrop-blur supports-[backdrop-filter]:backdrop-blur z-10">
                  <UserSearch
                    searchBox={searchBox}
                    titleClass={title}
                    mutedClass={muted}
                    currentUserId={currentUserId}
                    onPick={openDM}
                  />
                </div>

                <div className="px-2 pb-3 space-y-1">
                  {convos.map(c => {
                    const isActive = c.chat_id === chatId;
                    const fromMe = c.last?.user_id === currentUserId;
                    const highlight = (!fromMe && c.last !== null) || c.unread > 0;
                    const avatar = c.type === 'dm' ? c.peer?.avatar_url || undefined : undefined;
                    const name = c.type === 'dm' ? (c.peer?.full_name || 'Личные сообщения') : c.title;

                    return (
                      <button
                        key={c.chat_id}
                        onClick={() => router.push(`/messages/${c.chat_id}`)}
                        className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition
                          ${isActive ? 'bg-white/10 ring-1 ring-white/10' : 'hover:bg-white/5'}`}
                      >
                        <Avatar src={avatar} seed={name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className={`truncate text-sm ${highlight ? 'font-semibold' : 'font-medium'} ${title}`}>
                              {name}
                            </div>
                            {c.unread > 0 && (
                              <span className="ml-auto inline-flex items-center justify-center text-[10px] px-1.5 rounded-md bg-indigo-500/80 text-white">
                                {c.unread}
                              </span>
                            )}
                          </div>
                          <div className={`truncate text-xs ${muted}`}>
                            {c.last
                              ? `${c.last.user_id === currentUserId ? 'Вы' : (c.type === 'dm' ? (c.peer?.full_name || 'Он') : 'Участник')}: ${c.last.body}`
                              : 'Нет сообщений'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              {/* Messages */}
              <ChatArea
                className="col-[2] row-[2] min-h-0 overflow-hidden"
                messages={messages}
                me={currentUserId}
                formatTime={formatMessageTime}
                listRef={listRef}
                bubbleMe={bubbleMe}
                bubbleOther={bubbleOther}
                quickBtn={quickBtn}
                titleClass={title}
                mutedClass={muted}
                dividerClass={divider}
                onReply={handleReply}
              />

              {/* Composer */}
              <Composer
                className={`col-[2] row-[3] border-t ${isLight ? 'border-gray-200' : 'border-white/10'}`}
                text={text}
                setText={setText}
                sendMessage={sendMessage}
                inputRef={inputRef}
                connected={connected}
                sending={sending}
                typingUsers={typingUsers}
                onTyping={handleTyping}
                error={error}
                clearError={() => setError(null)}
                inputWrap={inputWrap}
                inputText={inputText}
                sendBtn={sendBtn}
                sendBtnDisabled={sendBtnDisabled}
                mutedClass={muted}
                replyTarget={replyTarget}
                cancelReply={cancelReply}
                replyChip={replyChip}
                titleClass={title}
                snippetFn={textSnippet}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* =================== UI bits =================== */
function TopBar({ className = '', title, subtitle, connected, titleClass, mutedClass }:{
  className?: string; title: string; subtitle?: string; connected: boolean; titleClass: string; mutedClass: string;
}) {
  return (
    <div className={'flex items-center gap-3 px-5 ' + className}>
      <div className="ml-3 flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-1.5">
        <Avatar seed={title} />
        <div>
          <div className={`text-sm font-medium ${titleClass}`}>{title}</div>
          <div className={`text-xs ${mutedClass}`}>{subtitle || 'Онлайн обсуждение'}</div>
        </div>
      </div>
      <div className="ml-auto">
        <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 ring-1 ring-white/10 px-2 py-1 text-[11px] text-white/70" title={connected ? 'Онлайн' : 'Переподключение…'}>
          <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-yellow-400 animate-pulse'}`} />
          {connected ? 'online' : 'reconnect…'}
        </span>
      </div>
    </div>
  );
}

function UserSearch({ searchBox, titleClass, mutedClass, currentUserId, onPick }:{
  searchBox: string; titleClass: string; mutedClass: string; currentUserId?: string; onPick: (userId: string)=>void;
}) {
  const [q, setQ] = useState(''); const [items, setItems] = useState<Array<{ id: string; full_name?: string; avatar_url?: string }>>([]); const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
        const data = await r.json();
        if (!alive) return;
        const arr = (data.items || []).filter((u: any) => u.id !== currentUserId);
        setItems(arr);
      } catch { if (alive) setItems([]); } finally { if (alive) setLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, currentUserId]);

  return (
    <>
      <input className={`w-full rounded-xl px-3 py-2 text-sm outline-none ${searchBox}`} placeholder="Искать по имени или ID…" value={q} onChange={(e)=>setQ(e.target.value)} />
      {q && (
        <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
          {items.map(u => (
            <button key={u.id} onClick={() => onPick(u.id)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-left">
              <Avatar src={u.avatar_url} seed={u.full_name || u.id} />
              <div className="min-w-0">
                <div className={`text-sm font-medium truncate ${titleClass}`}>{u.full_name || shortId(u.id)}</div>
                <div className={`text-xs ${mutedClass}`}>{shortId(u.id)}</div>
              </div>
            </button>
          ))}
          {!loading && items.length === 0 && <div className={`px-3 py-2 text-sm ${mutedClass}`}>Ничего не найдено</div>}
        </div>
      )}
    </>
  );
}

/* ===== Chat area ===== */
function ChatArea({
  className = '', messages, me, formatTime, listRef, bubbleMe, bubbleOther, quickBtn,
  titleClass, mutedClass, dividerClass, onReply
}:{
  className?: string;
  messages: Message[]; me?: string; formatTime: (iso: string)=>string; listRef: React.RefObject<HTMLDivElement>;
  bubbleMe: string; bubbleOther: string; quickBtn: string; titleClass: string; mutedClass: string; dividerClass: string;
  onReply: (m: Message) => void;
}) {
  return (
    <main className={'h-full ' + className}>
      <div ref={listRef} className="h-full overflow-y-auto px-6 py-4 space-y-6">
        <div className="flex items-center gap-4">
          <div className={`h-px flex-1 ${dividerClass}`} />
          <div className={`text-[11px] tracking-wide uppercase ${mutedClass}`}>Сегодня</div>
          <div className={`h-px flex-1 ${dividerClass}`} />
        </div>

        {messages.map((m) => {
          const isOwn = m.user_id === me;
          const bubble = isOwn ? bubbleMe : bubbleOther;
          const name = m.user?.full_name || shortId(m.user_id);

          return (
            <div key={m.id} className={`flex items-start gap-3 ${isOwn ? 'flex-row-reverse' : ''} relative`}>
              <Avatar src={m.user?.avatar_url || undefined} seed={m.user?.full_name || m.user_id} />
              <div className={`max-w-[70%] ${isOwn ? 'items-end text-right' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`text-xs ${mutedClass}`}>{isOwn ? 'Вы' : name}</div>
                      
                </div>

                {/* reply preview */}
                {m.reply_to && (
                  <div className="mb-1 px-3 py-1 text-xs rounded-xl bg-white/5 ring-1 ring-white/10 text-white/70 text-left">
                    <span className="opacity-80">{m.reply_to.user?.full_name || shortId(m.reply_to.user_id)}: </span>
                    <span className="opacity-90">{m.reply_to.body}</span>
                  </div>
                )}

                <div className={`rounded-2xl px-4 py-2 ${bubble}`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                </div>

                {/* toolbar (только ответ) */}
                <div className={`mt-1 flex ${isOwn ? 'justify-end' : ''} gap-1`}>
                  <IconButton className={quickBtn} title="Ответить" onClick={() => onReply(m)}>
                    <ReplySvg />
                  </IconButton>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function Composer({
  className = '', text, setText, sendMessage, inputRef, connected, sending, typingUsers, onTyping, error, clearError,
  inputWrap, inputText, sendBtn, sendBtnDisabled, mutedClass,
  replyTarget, cancelReply, replyChip, titleClass, snippetFn
}:{
  className?: string; text: string; setText: (v: string)=>void; sendMessage: (e: React.FormEvent)=>void; inputRef: React.RefObject<HTMLTextAreaElement>;
  connected: boolean; sending: boolean; typingUsers: Set<string>; onTyping: ()=>void; error: string | null; clearError: ()=>void;
  inputWrap: string; inputText: string; sendBtn: string; sendBtnDisabled: string; mutedClass: string;
  replyTarget: Message | null; cancelReply: ()=>void; replyChip: string; titleClass: string; snippetFn: (s: string)=>string;
}) {
  return (
    <div className={'px-6 py-3 [padding-bottom:calc(env(safe-area-inset-bottom)+12px)] ' + className}>
      <form onSubmit={sendMessage} className="flex items-end gap-3">
        <div className="flex-1">
          <div className={`rounded-2xl px-4 pt-2 pb-3 ${inputWrap}`}>
            {/* reply preview */}
            {replyTarget && (
              <div className={`mb-2 px-3 py-2 rounded-xl ring-1 ${replyChip} flex items-start gap-2`}>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs ${titleClass} opacity-80`}>
                    Ответ {replyTarget.user?.full_name || shortId(replyTarget.user_id)}
                  </div>
                  <div className={`text-xs ${mutedClass} truncate`}>
                    {snippetFn(replyTarget.body)}
                  </div>
                </div>
                <button type="button" onClick={cancelReply} className="shrink-0 h-6 w-6 rounded-md hover:bg-black/10" title="Отменить ответ">
                  <CloseSvg />
                </button>
              </div>
            )}

            <textarea
              ref={inputRef} rows={2} placeholder="Напишите сообщение…"
              className={`w-full resize-none bg-transparent text-sm outline-none ${inputText}`}
              value={text}
              onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) onTyping(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); }
                if (e.key === 'Escape' && replyTarget) { e.preventDefault(); cancelReply(); }
              }}
              maxLength={4000} disabled={!connected || sending}
            />
          </div>
        </div>
        <button type="submit" disabled={!text.trim() || sending || !connected}
          className={`h-10 min-w-[44px] px-4 rounded-2xl text-sm font-medium transition-colors ${sendBtn} disabled:${sendBtnDisabled} disabled:cursor-not-allowed`} title="Отправить">
          {sending ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </form>

      {typingUsers.size > 0 && (
        <div className={`px-1 pt-2 text-sm italic flex items-center gap-2 ${mutedClass}`}>
          <Dots /><span>{typingUsers.size === 1 ? 'печатает…' : `${typingUsers.size} человек печатают…`}</span>
        </div>
      )}

      {error && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-red-900/20 ring-1 ring-red-800/30 text-red-200 text-sm">
          {error} <button onClick={clearError} className="ml-2 underline underline-offset-2">закрыть</button>
        </div>
      )}
    </div>
  );
}

/* =================== helpers & icons =================== */
function proxied(url: string, size = 64) { return `/api/image-proxy?u=${encodeURIComponent(url)}&s=${size}`; }
function Avatar({ seed = 'u', src, size = 36 }: { seed?: string; src?: string; size?: number; }) {
  const hue = Math.abs(hash(seed)) % 360;
  return (
    <div className="h-9 w-9 rounded-2xl shrink-0 ring-1 ring-white/10 overflow-hidden"
         style={{ height: size, width: size, background: `radial-gradient(circle at 30% 30%, hsl(${hue} 70% 65% / .9), hsl(${hue} 70% 25% / .9))` }}
         title={seed}>
      {src ? <img src={proxied(src, size)} alt="" className="h-full w-full object-cover" /> : null}
    </div>
  );
}
function IconButton({ children, title, className = '', onClick }: React.PropsWithChildren<{ title: string; className?: string; onClick?: ()=>void }>) {
  return (<button title={title} onClick={onClick} className={`h-7 w-7 inline-flex items-center justify-center rounded-lg ${className}`}>{children}</button>);
}
function ReplySvg(){return(<svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current opacity-90"><path d="M9 14l-5-5 5-5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 9h7a7 7 0 017 7v2" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>);}
function CloseSvg(){return(<svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current opacity-90"><path d="M6 6l12 12M18 6L6 18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>);}
function Dots(){return(<div className="flex space-x-1"><span className="w-2 h-2 bg-white/70 rounded-full animate-bounce" /><span className="w-2 h-2 bg-white/70 rounded-full animate-bounce [animation-delay:120ms]" /><span className="w-2 h-2 bg-white/70 rounded-full animate-bounce [animation-delay:240ms]" /></div>);}
function hash(s: string){let h=0;for(let i=0;i<s.length;i++)h=(h<<5)-h+s.charCodeAt(i);return h;}
function shortId(id?: string){ return id && id.length>8 ? id.slice(0,8)+'…' : (id ?? ''); }
