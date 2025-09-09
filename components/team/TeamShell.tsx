'use client'

import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, BookOpen, MessageCircle, Calendar, Check, Heart, UsersRound, Share2 } from 'lucide-react'
import TeamOverview from '@/components/team/TeamOverview'
import TeamMembers from '@/components/team/TeamMembers'
import TeamResources from '@/components/team/TeamResources'
import TeamTitles from '@/components/team/TeamTitles'
import TeamPosts from '@/components/team/TeamPosts'
import { useAuth } from '@/lib/auth/context'
import { useTheme } from '@/lib/theme/context'
import { normalizeRole } from '@/lib/team/roles'
import type { TeamTitle } from '@/lib/team/titles'

type Member = {
  user_id: string
  role: string
  profile: { id: string; username: string | null; avatar_url: string | null } | null
}

export default function TeamShell({
  slug,
  team,
  titles,
  members,
}: {
  slug: string
  team: any
  titles: TeamTitle[]
  members: Member[]
}) {
  const { theme } = useTheme()
  const { user, profile } = useAuth()
  const [tab, setTab] = useState<'overview' | 'titles' | 'posts'>('overview')

  const myRole = useMemo(() => {
    if (!user?.id) return null
    const rec = members.find(m => m.user_id === user.id)
    return normalizeRole(rec?.role)
  }, [members, user?.id])

  const canPost = useMemo(() => {
    if (!user) return false
    const isAdmin   = String(profile?.role || '').toLowerCase() === 'admin'
    const isCreator = team?.created_by === user?.id
    const isLeader  = myRole === 'leader'
    return isAdmin || isCreator || isLeader || Boolean(team?.can_post)
  }, [user?.id, profile?.role, myRole, team?.created_by, team?.can_post])

  const bgCard = theme === 'light' ? 'bg-white border-gray-200' : 'bg-slate-800/60 border-slate-700'
  const text   = theme === 'light' ? 'text-slate-900' : 'text-white'
  const muted  = theme === 'light' ? 'text-slate-600' : 'text-slate-300'

  return (
    <div className="space-y-6">
      {/* ======= Герой/шапка как раньше ======= */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl overflow-hidden border shadow-sm ${bgCard}`}
      >
        {/* Баннер */}
        <div className="relative h-56 sm:h-64 md:h-72 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">
          {team.banner_url && (
            <img src={team.banner_url} alt="banner" className="absolute inset-0 h-full w-full object-cover opacity-80" />
          )}
          <div className="absolute inset-0 bg-black/20" />
        </div>

        {/* Тёмная полоса под баннером */}
        <div className="bg-slate-900 text-white px-6 py-5">
          <div className="flex items-start justify-between gap-6">
            {/* Левая часть */}
            <div className="flex items-center gap-6 min-w-0">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="-mt-16 relative">
                <div className="relative overflow-hidden rounded-2xl bg-white ring-4 ring-white shadow-xl h-[96px] w-[96px] sm:h-[110px] sm:w-[110px]">
                  {team.avatar_url
                    ? <img src={team.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                    : <div className="grid h-full w-full place-items-center text-4xl bg-gradient-to-br from-blue-400 to-purple-600">🦊</div>}
                </div>
                {team.verified && (
                  <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#4285f4] text-white shadow-lg">
                    <Check className="h-4 w-4" />
                  </div>
                )}
              </motion.div>

              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-3">
                  <h1 className="text-3xl font-bold truncate">{team.name}</h1>
                </div>
                <div className="mb-3 text-[16px] text-slate-300">@{team.slug ?? team.id}</div>

                {/* Счётчики */}
                <div className="flex flex-wrap items-center gap-6 text-[15px]">
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold">{team.likes_count ?? 0}</span>
                    <span className="text-slate-400">лайков</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <UsersRound className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold">{team.followers_count ?? 0}</span>
                    <span className="text-slate-400">подписчиков</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold">{titles.length}</span>
                    <span className="text-slate-400">тайтлов</span>
                  </div>
                  {team.started_at && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-300">с {new Date(team.started_at).getFullYear()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Правая часть — кнопки (share/подписка можно нарастить позже) */}
            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={() => navigator.clipboard?.writeText(window.location.href)}
                className="p-3 rounded-xl border-2 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 shadow-sm"
                title="Скопировать ссылку"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ======= Табы ======= */}
      <div className={`rounded-2xl border ${bgCard} overflow-hidden`}>
        <div className="-mx-3 px-3 overflow-x-auto sm:overflow-visible">
          <div className="flex min-w-max sm:min-w-0">
            <Tab active={tab === 'overview'} onClick={() => setTab('overview')} icon={<Activity className="w-4 h-4" />}>Обзор</Tab>
            <Tab active={tab === 'titles'}   onClick={() => setTab('titles')}   icon={<BookOpen className="w-4 h-4" />}>Переводят ({titles.length})</Tab>
            <Tab active={tab === 'posts'}    onClick={() => setTab('posts')}    icon={<MessageCircle className="w-4 h-4" />}>Посты</Tab>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <AnimatePresence mode="wait">
            {tab === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 gap-6 lg:grid-cols-3"
              >
                {/* Левая колонка: О команде + овервью из старого UI */}
                <div className="space-y-6">
                  <div className={`rounded-2xl border p-6 shadow-sm ${bgCard}`}>
                    <h2 className={`mb-4 text-[18px] font-semibold ${text}`}>О команде</h2>
                    <TeamOverview team={team} />
                  </div>

                  {/* Статистика — можно нарастить реальными полями позже */}
                  <div className={`rounded-2xl border p-6 shadow-sm ${bgCard}`}>
                    <h2 className={`mb-4 text-[18px] font-semibold ${text}`}>Статистика</h2>
                    <div className="grid grid-cols-2 gap-4">
                      <div className={`${theme === 'light' ? 'bg-blue-50' : 'bg-blue-600/10'} p-4 rounded-lg`}>
                        <div className={`text-2xl font-bold ${theme === 'light' ? 'text-blue-900' : 'text-blue-400'}`}>{team.stats_chapters ?? 0}</div>
                        <div className={`text-sm ${theme === 'light' ? 'text-blue-600' : 'text-blue-300'}`}>Глав переведено</div>
                      </div>
                      <div className={`${theme === 'light' ? 'bg-green-50' : 'bg-green-600/10'} p-4 rounded-lg`}>
                        <div className={`text-2xl font-bold ${theme === 'light' ? 'text-green-900' : 'text-green-400'}`}>{team.stats_inwork ?? 0}</div>
                        <div className={`text-sm ${theme === 'light' ? 'text-green-600' : 'text-green-300'}`}>В работе</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Средняя колонка: ресурсы + команда */}
                <div className="space-y-6">
                  <div className={`rounded-2xl border p-6 shadow-sm ${bgCard}`}>
                    <h2 className={`mb-4 text-[18px] font-semibold ${text}`}>Ресурсы</h2>
                    <TeamResources team={team} />
                  </div>
                  <div className={`rounded-2xl border p-6 shadow-sm ${bgCard}`}>
                    <h2 className={`mb-4 text-[18px] font-semibold ${text}`}>Команда ({members.length})</h2>
                    <TeamMembers members={members} />
                  </div>
                </div>

                {/* Правая колонка: плейсхолдеры «топ подписчиков» и «найм» */}
                <div className="space-y-6">
                  <div className={`rounded-2xl border p-6 shadow-sm ${bgCard}`}>
                    <h2 className={`mb-4 text-[18px] font-semibold ${text}`}>Топ подписчиков</h2>
                    <div className={`${muted} text-sm`}>Позже подставим реальных данных</div>
                  </div>
                  {(team.hiring_text || team.hiring_enabled === false) && (
                    <div className={`rounded-2xl border p-6 shadow-sm ${theme === 'light' ? 'border-amber-200 bg-amber-50' : 'border-amber-600/30 bg-amber-600/10'}`}>
                      {team.hiring_enabled === false ? (
                        <>
                          <h4 className={theme === 'light' ? 'text-amber-800 font-semibold mb-2' : 'text-amber-400 font-semibold mb-2'}>Команда укомплектована</h4>
                          <p className={theme === 'light' ? 'text-amber-700 text-sm' : 'text-amber-300 text-sm'}>Сейчас набор закрыт.</p>
                        </>
                      ) : (
                        <>
                          <h4 className={theme === 'light' ? 'text-amber-800 font-semibold mb-2' : 'text-amber-400 font-semibold mb-2'}>Мы ищем таланты!</h4>
                          <p className={theme === 'light' ? 'text-amber-700 text-sm' : 'text-amber-300 text-sm'}>{team.hiring_text}</p>
                        </>
                      )}
                      <button className={`mt-3 w-full rounded-lg py-2 text-sm font-medium transition-colors ${
                        theme === 'light'
                          ? 'bg-amber-200 text-amber-800 hover:bg-amber-300'
                          : 'bg-amber-600/20 text-amber-300 border border-amber-600/30 hover:bg-amber-600/30'
                      }`}>Связаться с командой</button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {tab === 'titles' && (
              <motion.div key="titles" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <TeamTitles titles={titles} />
              </motion.div>
            )}

            {tab === 'posts' && (
              <motion.div key="posts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <TeamPosts teamSlug={slug} teamId={team.id} canPost={canPost} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function Tab({ children, active, onClick, icon }: { children: React.ReactNode; active?: boolean; onClick?: () => void; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'relative flex items-center gap-2 px-6 py-4 font-medium transition-all',
        active
          ? 'text-[#2196F3] bg-gradient-to-b from-blue-50 to-white border-b-2 border-[#2196F3] dark:from-slate-700 dark:to-slate-800'
          : 'text-slate-600 hover:text-slate-900 hover:bg-gray-50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700/40'
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  )
}
