'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search, UserCheck, Shield, Crown, Users, Loader2, Filter,
} from 'lucide-react';
import { useTheme } from '@/lib/theme/context';
import Image from 'next/image';

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  role: 'admin' | 'moderator' | 'user' | null;
  avatar_url: string | null;
  created_at: string;
};

export function UserManagement() {
  const { theme } = useTheme();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const textClass = theme === 'light' ? 'text-gray-900' : 'text-white';
  const mutedTextClass = theme === 'light' ? 'text-gray-600' : 'text-slate-400';
  const cardClass = theme === 'light' ? 'bg-white border-gray-200 shadow-sm' : 'bg-slate-800 border-slate-700 shadow-lg';

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store', headers: { 'x-admin': '1' } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setUsers(json.items as Profile[]);
    } catch (e) {
      console.error('Error fetching users:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function updateUserRole(userId: string, newRole: Profile['role']) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin': '1' },
        body: JSON.stringify({ id: userId, role: newRole }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const getRoleBadge = (role: string | null) => {
    const roles = {
      admin: { label: 'Админ', color: 'bg-red-500/20 text-red-400 border-red-500/50' },
      moderator: { label: 'Модератор', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' },
      user: { label: 'Пользователь', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
    };
    const roleData = roles[(role as keyof typeof roles) || 'user'];
    return <span className={`px-2 py-1 rounded-md text-xs font-semibold border ${roleData.color}`}>{roleData.label}</span>;
  };

  const filteredUsers = users.filter((user) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      user.username?.toLowerCase().includes(q) ||
      user.full_name?.toLowerCase().includes(q) ||
      user.id.toLowerCase().includes(q);

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className={mutedTextClass}>Загрузка пользователей...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Управление пользователями</h1>
        <p className={mutedTextClass}>Управляйте пользователями, назначайте роли и модерируйте аккаунты</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { title: 'Всего пользователей', value: users.length, icon: Users, color: 'from-blue-500 to-blue-600' },
          { title: 'Администраторов', value: users.filter((u) => u.role === 'admin').length, icon: Crown, color: 'from-red-500 to-red-600' },
          { title: 'Модераторов', value: users.filter((u) => u.role === 'moderator').length, icon: Shield, color: 'from-yellow-500 to-yellow-600' },
          { title: 'Активных', value: users.filter((u) => !u.role || u.role === 'user').length, icon: UserCheck, color: 'from-green-500 to-green-600' },
        ].map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-4 rounded-xl border ${cardClass}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-2xl font-bold ${textClass}`}>{stat.value}</p>
                  <p className={`text-sm ${mutedTextClass}`}>{stat.title}</p>
                </div>
                <div className={`p-2 rounded-lg bg-gradient-to-r ${stat.color}`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className={`p-4 rounded-xl border ${cardClass}`}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${mutedTextClass}`} />
            <input
              type="text"
              placeholder="Поиск пользователей..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                theme === 'light' ? 'bg-gray-50 border-gray-200 text-gray-900' : 'bg-slate-700 border-slate-600 text-white'
              }`}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className={`w-5 h-5 ${mutedTextClass}`} />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className={`px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                theme === 'light' ? 'bg-gray-50 border-gray-200 text-gray-900' : 'bg-slate-700 border-slate-600 text-white'
              }`}
            >
              <option value="all">Все роли</option>
              <option value="user">Пользователи</option>
              <option value="moderator">Модераторы</option>
              <option value="admin">Администраторы</option>
            </select>
          </div>
        </div>
      </div>

      <div className={`rounded-xl border ${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={theme === 'light' ? 'bg-gray-50' : 'bg-slate-700/50'}>
              <tr>
                <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${mutedTextClass}`}>Пользователь</th>
                <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${mutedTextClass}`}>Роль</th>
                <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${mutedTextClass}`}>Дата регистрации</th>
                <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${mutedTextClass}`}>Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
              {filteredUsers.map((user) => (
                <tr key={user.id} className={`hover:${theme === 'light' ? 'bg-gray-50' : 'bg-slate-700/50'} transition-colors`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-r from-blue-500 to-purple-500">
                        {user.avatar_url ? (
                          <Image src={user.avatar_url} alt="Avatar" width={40} height={40} className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                            {user.username?.[0]?.toUpperCase() || user.full_name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className={`font-semibold ${textClass}`}>{user.username || user.full_name || 'Без имени'}</p>
                        <p className={`text-sm ${mutedTextClass}`}>{user.id.slice(0, 8)}...</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                  <td className="px-6 py-4">
                    <div className={mutedTextClass}>
                      {new Date(user.created_at).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateUserRole(user.id, 'user')}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-white/10"
                        title="Сделать пользователем"
                      >
                        User
                      </button>
                      <button
                        onClick={() => updateUserRole(user.id, 'moderator')}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-white/10"
                        title="Сделать модератором"
                      >
                        Moderator
                      </button>
                      <button
                        onClick={() => updateUserRole(user.id, 'admin')}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-white/10"
                        title="Сделать админом"
                      >
                        Admin
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm opacity-70">
                    Ничего не найдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
