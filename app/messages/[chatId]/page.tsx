'use client';

import React, { useEffect, useState } from 'react';
import ChatWindow from '@/components/ChatWindow';
import { useParams } from 'next/navigation';

type ChatInfo = {
  id: number;
  type: 'dm' | 'group';
  title: string;
  members: Array<{
    user_id: string;
    role: string;
    full_name?: string | null;
    avatar_url?: string | null;
  }>;
};

export default function ChatPage() {
  const params = useParams<{ chatId: string }>();
  const chatId = Number(params?.chatId);

  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [me, setMe] = useState<string | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(chatId)) return;
    let alive = true;

    async function loadChatInfo() {
      try {
        setErr(null);
        const response = await fetch(`/api/chats/${chatId}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Не удалось загрузить информацию о чате');
        const data = await response.json();
        if (!alive) return;
        if (!data?.ok) throw new Error(data?.message || 'bad_response');

        setChatInfo(data.chat as ChatInfo);
        setMe(data.meId as string);
      } catch (e: any) {
        if (alive) setErr(e?.message || 'Ошибка загрузки');
      }
    }

    loadChatInfo();
    return () => { alive = false; };
  }, [chatId]);

  if (!Number.isFinite(chatId)) return <div className="p-6 text-red-400">Некорректный chatId</div>;
  if (err) return <div className="p-6 text-red-400">{err}</div>;
  if (!chatInfo) return <div className="p-6 text-gray-400">Загрузка…</div>;

  return (
    <ChatWindow
      chatId={chatId}
      currentUserId={me}
      chatInfo={chatInfo}
    />
  );
}
