'use client';

import { useAuth } from '@/lib/auth/context';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { MessageSquare, Plus, Users, User, Search } from 'lucide-react';

type Chat = {
  id: number;
  type: 'dm' | 'group';
  title?: string;
  created_at: string;
  members: Array<{ user_id: string; role: string }>;
  last_message?: {
    id: number;
    user_id: string;
    body: string;
    created_at: string;
  };
  unread_count: number;
};

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Загрузка чатов
  const loadChats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/chats', {
        credentials: 'include',
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Не удалось загрузить чаты: ${response.status}`);
      }

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.message || 'Не удалось загрузить чаты');
      }

      setChats(data.items || []);
    } catch (err) {
      console.error('Failed to load chats:', err);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить чаты');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      loadChats();
    }
  }, [authLoading, user, loadChats]);

  // Фильтрация чатов по поиску
  const filteredChats = chats.filter(chat => {
    if (!searchTerm) return true;
    
    const search = searchTerm.toLowerCase();
    
    if (chat.title?.toLowerCase().includes(search)) return true;
    if (chat.last_message?.body.toLowerCase().includes(search)) return true;
    
    return false;
  });

  // Форматирование времени
  const formatMessageTime = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 7) {
      return date.toLocaleDateString('ru');
    } else if (days > 0) {
      return `${days}д назад`;
    } else if (hours > 0) {
      return `${hours}ч назад`;
    } else {
      return 'Только что';
    }
  }, []);

  // Название чата
  const getChatDisplayName = useCallback((chat: Chat) => {
    if (chat.type === 'group') {
      return chat.title || 'Групповой чат';
    }
    
    const otherMember = chat.members?.find(m => m.user_id !== user?.id);
    if (otherMember) {
      return `Чат с пользователем ${otherMember.user_id.slice(0, 8)}`;
    }
    
    return 'Личные сообщения';
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Требуется авторизация</h1>
          <p>Войдите в аккаунт для доступа к сообщениям.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 min-h-screen">
        {/* Заголовок */}
        <div className="border-b border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Сообщения
            </h1>
            <button className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Поиск */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Поиск чатов..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg
                       bg-white dark:bg-slate-700 text-gray-900 dark:text-white
                       placeholder-gray-500 dark:placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Ошибка */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <div className="text-red-700 dark:text-red-400">{error}</div>
            <button 
              onClick={loadChats}
              className="text-sm text-red-600 dark:text-red-400 hover:underline mt-1"
            >
              Повторить
            </button>
          </div>
        )}

        {/* Список чатов */}
        <div className="flex-1">
          {filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-gray-500 dark:text-slate-400 p-8">
              <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
              {searchTerm ? (
                <p>Чатов с запросом "{searchTerm}" не найдено</p>
              ) : (
                <>
                  <p className="text-center mb-4">Пока нет чатов</p>
                  <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                    Начать первый чат
                  </button>
                </>
              )}
            </div>
          ) : (
            filteredChats.map((chat) => (
              <Link key={chat.id} href={`/messages/${chat.id}`}>
                <div className="p-4 border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer">
                  <div className="flex items-start gap-3">
                    {/* Иконка чата */}
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
                        {chat.type === 'group' ? (
                          <Users className="w-6 h-6 text-gray-500 dark:text-slate-400" />
                        ) : (
                          <User className="w-6 h-6 text-gray-500 dark:text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Содержимое чата */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium text-gray-900 dark:text-white truncate">
                          {getChatDisplayName(chat)}
                        </h3>
                        <div className="flex items-center gap-2">
                          {chat.last_message && (
                            <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                              {formatMessageTime(chat.last_message.created_at)}
                            </span>
                          )}
                          {chat.unread_count > 0 && (
                            <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                              {chat.unread_count > 99 ? '99+' : chat.unread_count}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Последнее сообщение */}
                      {chat.last_message ? (
                        <p className="text-sm text-gray-600 dark:text-slate-400 truncate">
                          {chat.last_message.body}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400 dark:text-slate-500 italic">
                          Пока нет сообщений
                        </p>
                      )}

                      {/* Количество участников для группы */}
                      {chat.type === 'group' && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                          {chat.members?.length || 0} участников
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}   