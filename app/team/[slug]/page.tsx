// app/team/[slug]/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

import { Header } from '@/components/Header'
import { useTheme } from '@/lib/theme/context'
import { useAuth } from '@/lib/auth/context'
import type { Tables } from '@/database.types'
import TeamPosts from '@/components/team/TeamPosts'
import {
  Users as UsersIcon,
  ChevronDown,
  ChevronUp,
  Check,
  Heart,
  UsersRound,
  Edit,
  X,
  Plus,
  Trash2,
  Star,
  Calendar,
  ExternalLink,
  BookOpen,
  TrendingUp,
  Award,
  MessageCircle,
  Share2,
  Clock,
  Activity
} from 'lucide-react'

const DEV = process.env.NODE_ENV !== 'production'

/* ========= DB types ========= */
type Team = Tables<'translator_teams'>
type TeamMember = Tables<'translator_team_members'>
type Profile = Tables<'profiles'>

type ProfileLite = Pick<Profile, 'id' | 'username' | 'avatar_url'>
type MemberWithProfile = TeamMember & { profile: ProfileLite | null }

type TeamTitle = {
  id: number
  name: string
  slug?: string | null
  cover_url?: string | null
  status?: string | null
  chapters_count?: number
  rating?: number
  last_update?: string
}

type EditValues = {
  name: string
  avatar_url: string
  banner_url?: string | null
  bio: string
  hiring_enabled: boolean
  hiring_text: string | null
  discord_enabled: boolean
  discord_url: string | null
  boosty_enabled: boolean
  boosty_url: string | null
  telegram_enabled: boolean
  telegram_url: string | null
  vk_enabled: boolean
  vk_url: string | null
  langs: string[]
  tags: string[]
  members: { username: string; role: string }[]
}

/* ========= helpers for schema-agnostic mapping ========= */
function pickStr(o: any, keys: string[], fallback = ''): string {
  for (const k of keys) {
    const v = o?.[k]
    if (v !== undefined && v !== null && String(v).trim().length) return String(v)
  }
  return fallback
}
// унификация роли (лидер/owner/lead → 'leader')
function normalizeRole(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.toString().trim().toLowerCase()
  if (['leader','lead','лидер','owner','глава'].includes(v)) return 'leader'
  return v
}

function pickNullableStr(o: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = o?.[k]
    if (v !== undefined && v !== null && String(v).trim().length) return String(v)
  }
  return null
}

function mapTitleRow(row: any): TeamTitle {
  return {
    id: Number(row.id),
    name: pickStr(row, ['title', 'name'], 'Без названия'),
    slug: pickNullableStr(row, ['slug']),
    cover_url: pickNullableStr(row, ['cover_url']),
    status: pickNullableStr(row, ['status']),
    chapters_count: row.chapters_count || 0,
    rating: row.rating || 0,
    last_update: row.updated_at || row.created_at
  }
}

/* ========= collapsible text ========= */
function AboutCollapser({
  text,
  theme,
  collapsedHeight = 220,
}: {
  text: string
  theme: 'light' | 'dark'
  collapsedHeight?: number
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [overflow, setOverflow] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOverflow(el.scrollHeight > collapsedHeight + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, collapsedHeight])

  return (
    <div className="relative mb-6">
      <div
        ref={ref}
        style={{ maxHeight: expanded ? undefined : collapsedHeight }}
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
      >
        <div className={`whitespace-pre-wrap text-[15px] leading-relaxed ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
          {text}
        </div>
      </div>

      {!expanded && overflow && (
        <div className={`pointer-events-none absolute left-0 right-0 bottom-10 h-16 bg-gradient-to-b from-transparent ${theme === 'light' ? 'to-white' : 'to-slate-900'}`} />
      )}

      {overflow && (
        <button
          onClick={() => setExpanded(v => !v)}
          className={`mt-3 inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm
            ${theme === 'light' ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-slate-600 hover:bg-slate-700/40 text-slate-200'}`}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? 'Свернуть' : 'Развернуть'}
        </button>
      )}
    </div>
  )
}

export default function TeamPage(): JSX.Element {
  const { theme } = useTheme()
  const { user, profile } = useAuth()

  const params = useParams() as Record<string, string | string[]> | null
  const slug =
    (Array.isArray(params?.slug) ? params?.slug?.[0] : (params?.slug as string | undefined)) ?? ''

  // загрузки разделены
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingTitles, setLoadingTitles] = useState(false)

  const [team, setTeam] = useState<Team | (Team & { followers_count?: number; i_follow?: boolean }) | null>(null)
  const [members, setMembers] = useState<MemberWithProfile[]>([])
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followPending, setFollowPending] = useState(false)

  const [activeTab, setActiveTab] = useState<'overview' | 'titles' | 'posts'>('overview')

  const [titles, setTitles] = useState<TeamTitle[]>([])

  const [showAllMembers, setShowAllMembers] = useState(false)
  const [showAllTags, setShowAllTags] = useState(false)

  // для всплывашки "Ссылка скопирована"
  const [copied, setCopied] = useState(false)

  // лок против конкурирующих загрузок
  const loadLockRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const lastFocusRefresh = useRef(0)

  const refreshOnFocus = async () => {
    if (!slug) return
    const now = Date.now()
    if (now - lastFocusRefresh.current < 60_000) return // не чаще раза в минуту
    lastFocusRefresh.current = now

    try {
      const ac = new AbortController()
      const r = await fetch(`/api/teams/${encodeURIComponent(slug)}`, {
        cache: 'no-store',
        signal: ac.signal,
      })
      if (!r.ok) return
      const fresh = await r.json()
      setTeam(prev => prev ? { ...(prev as any), followers_count: fresh.followers_count ?? (prev as any).followers_count } : prev)
      setIsFollowing(Boolean(fresh.i_follow))
    } catch (e) {
      if (DEV) console.warn('refreshOnFocus error', e)
    }
  }

  // единый загрузчик данных команды
  const loadTeam = async (isFirst: boolean, withTitles: boolean = true) => {
    // 1) отменяем предыдущую пачку запросов, если она ещё идёт
    abortRef.current?.abort()
  
    // 2) создаём новый контроллер для текущего запуска
    const ac = new AbortController()
    abortRef.current = ac
    const { signal } = ac
  
    if (loadLockRef.current) return
    loadLockRef.current = true
  
    isFirst ? setInitialLoading(true) : setRefreshing(true)
    if (withTitles) setLoadingTitles(true)
  
    if (DEV) console.log('Loading team:', slug)
  
    try {
      // === 1) Команда ===
      const rTeam = await fetch(`/api/teams/${encodeURIComponent(slug)}`, {
        cache: 'no-store',
        signal,
      })
      if (!rTeam.ok) {
        if (signal.aborted) return
        setTeam(null)
        setMembers([])
        setTitles([])
        return
      }
      const t = await rTeam.json()
      if (signal.aborted) return
      if (DEV) console.log('Team data:', t)
      setTeam(t)
      setIsFollowing(Boolean(t.i_follow))
  
      // === 2) Тайтлы ===
      if (withTitles && t?.id && !signal.aborted) {
        try {
          const r2 = await fetch(`/api/catalog?teamId=${t.id}`, {
            cache: 'no-store',
            signal,
          })
          if (signal.aborted) return
          if (r2.ok) {
            const j2 = await r2.json()
            if (signal.aborted) return
            const arr: any[] = Array.isArray(j2?.items)
              ? j2.items
              : Array.isArray(j2?.data)
              ? j2.data
              : []
            setTitles(arr.map(mapTitleRow))
          } else {
            setTitles([])
          }
        } catch {
          if (!signal.aborted) setTitles([])
        }
      }
  
      // === 3) Участники ===
      if (t?.id && !signal.aborted) {
        void (async () => {
          const membersAC = new AbortController()
          const timeoutId = setTimeout(() => membersAC.abort('timeout'), 8000)

          try {
            if (DEV) console.log('Loading members for team:', t.id, 'slug:', slug)
            const rMem = await fetch(
              `/api/teams/${encodeURIComponent(slug)}/members`,
              {
                cache: 'no-store',
                signal: membersAC.signal,
              }
            )

            if (!rMem.ok) {
              const errorText = await rMem.text().catch(() => '')
              throw new Error(`HTTP ${rMem.status} ${errorText}`)
            }

            const jm = await rMem.json()
            const items = Array.isArray(jm?.items) ? jm.items : []

            // обновляем состояние только если внешний loadTeam ещё актуален
            if (!signal.aborted) {
              setMembers(items as MemberWithProfile[])
            }
            if (DEV) console.log('Members loaded:', items.length)
          } catch (e) {
            if (!signal.aborted) {
              if (DEV) console.warn('members fetch failed:', e)
              setMembers([])
            }
          } finally {
            clearTimeout(timeoutId)
          }
        })()
      } else if (!t?.id && !signal.aborted) {
        if (DEV) console.log('No team ID, clearing members')
        setMembers([])
      }
          } catch (e: any) {
      // если отменили — тихо выходим
      if (e?.name !== 'AbortError') {
        if (DEV) console.error('Error loading team:', e)
        setTeam(null)
        setMembers([])
        setTitles([])
      }
    } finally {
      // если запросы отменили — не трогаем спиннеры/флаги
      if (!signal.aborted) {
        if (withTitles) setLoadingTitles(false)
        isFirst ? setInitialLoading(false) : setRefreshing(false)
      }
      loadLockRef.current = false
  
      // если это всё ещё актуальный контроллер — очищаем ссылку
      if (abortRef.current === ac) abortRef.current = null
    }
  }  
  
  useEffect(() => {
    return () => {
      // уходим со страницы — отменяем все висящие запросы
      abortRef.current?.abort()
    }
  }, [])  

  // первичная загрузка + refresh на фокус
  useEffect(() => {
    if (!slug) { 
      setInitialLoading(false); 
      return; 
    }
    void loadTeam(true, true);

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void refreshOnFocus();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [slug])

  // актуализация подписки по появлению user/команды — через наш API
  useEffect(() => {
    if (!team) return
    void refreshOnFocus()
  }, [user?.id]) // зависимость по team?.id можно убрать  

  const toggleFollow = async () => {
    if (!user?.id || !team || followPending) return
    setFollowPending(true)
  
    const wasFollowing = isFollowing
    const prevCount = (team as any).followers_count ?? 0
  
    // Оптимистичный апдейт
    setIsFollowing(!wasFollowing)
    setTeam(prev => prev ? {
      ...(prev as any),
      followers_count: Math.max(0, prevCount + (wasFollowing ? -1 : 1))
    } as any : prev)
  
    try {
      const slugOrId = (team as any).slug ?? (team as any).id
      const r = await fetch(`/api/teams/${encodeURIComponent(slugOrId)}/follow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(DEV && user?.id ? { 'x-user-id': user.id } : {}),
        },
        body: JSON.stringify({ follow: !wasFollowing }),
      })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      setIsFollowing(Boolean(j.i_follow ?? !wasFollowing))
      setTeam(prev => prev ? { ...(prev as any), followers_count: j.followers_count ?? prevCount } : prev)
    } catch (e) {
      if (DEV) console.error('toggleFollow failed', e)
      // Откат
      setIsFollowing(wasFollowing)
      setTeam(prev => prev ? { ...(prev as any), followers_count: prevCount } : prev)
    } finally {
      setFollowPending(false)
    }
  }  

  const copyLink = async () => {
    try {
      const url = window.location.href
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea')
        ta.value = url
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      if (DEV) console.error('copy link failed', e)
    }
  }

  // моя роль в команде по данным участников
  const myRole = useMemo(() => {
    if (!user?.id) return null
    const rec = members.find(m => m.user_id === user.id)
    return normalizeRole(rec?.role)
  }, [members, user?.id])

  // сервер-согласованный расчёт прав на редактирование
  const canEdit = useMemo(() => {
    if (!user) return false
    const isAdmin = String(profile?.role || '').toLowerCase() === 'admin'
    if (isAdmin) return true
    const isCreator = (team as any)?.created_by === user.id
    const isLeader  = myRole === 'leader'
    return isCreator || isLeader
  }, [user?.id, profile?.role, myRole, (team as any)?.created_by])

  const bgClass =
    theme === 'light' ? 'bg-gray-50' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'
  const cardBgClass =
    theme === 'light' ? 'bg-white border-gray-200' : 'bg-slate-800/60 backdrop-blur-sm border-slate-700'
  const textClass = theme === 'light' ? 'text-gray-900' : 'text-white'
  const mutedTextClass = theme === 'light' ? 'text-gray-600' : 'text-slate-400'

  if (!slug) {
    return (
      <div className={`min-h-screen ${bgClass}`}>
        <Header showSearch={false} />
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className={`rounded-2xl border p-6 ${cardBgClass}`}>
            <div className="text-center">
              <div className="text-4xl mb-4">🔍</div>
              <h1 className={`text-2xl font-bold ${textClass} mb-2`}>Неверный URL</h1>
              <p className={mutedTextClass}>Отсутствует идентификатор команды в URL</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (initialLoading) {
    return (
      <div className={`min-h-screen ${bgClass}`}>
        <Header showSearch={false} />
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className={`h-48 rounded-2xl border animate-pulse ${cardBgClass}`} />
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className={`h-32 rounded-2xl border animate-pulse ${cardBgClass}`} />
            <div className={`h-32 rounded-2xl border animate-pulse ${cardBgClass}`} />
            <div className={`h-32 rounded-2xl border animate-pulse ${cardBgClass}`} />
          </div>
        </div>
      </div>
    )
  }

  if (!team) {
    return (
      <div className={`min-h-screen ${bgClass}`}>
        <Header showSearch={false} />
        <div className="mx-auto max-w-6xl px-4 py-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border p-8 ${cardBgClass} text-center`}
          >
            <div className="text-6xl mb-6">😔</div>
            <h1 className={`text-3xl font-bold ${textClass} mb-4`}>Команда не найдена</h1>
            <p className={`${mutedTextClass} mb-6 text-lg`}>
              К сожалению, команда с таким именем не существует или была удалена
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.history.back()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Вернуться назад
            </motion.button>
          </motion.div>
        </div>
      </div>
    )
  }

  const resources = (
    [
      (team as any).discord_url && { key: 'Discord', href: (team as any).discord_url as string, icon: 'D', color: 'bg-[#7289da]' },
      (team as any).boosty_url && { key: 'Boosty', href: (team as any).boosty_url as string, icon: 'B', color: 'bg-[#ff6b35]' },
      (team as any).telegram_url && { key: 'Telegram', href: (team as any).telegram_url as string, icon: 'TG', color: 'bg-[#2AABEE]' },
      (team as any).vk_url && { key: 'VK', href: (team as any).vk_url as string, icon: 'VK', color: 'bg-[#0077FF]' }
    ].filter(Boolean) as { key: string; href: string; icon: string; color: string }[]
  )

  return (
    <div className={`min-h-screen ${bgClass}`}>
      <Header showSearch={false} />

      {refreshing && <div className="fixed left-0 top-0 h-0.5 w-full bg-blue-500/70" />}

      <div className="mx-auto max-w-6xl px-5 pt-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 text-sm">
          <span className={`uppercase tracking-wide ${mutedTextClass}`}>Команды переводчиков</span>
          <span className={mutedTextClass}>/</span>
          <span className={textClass}>{team.name}</span>
        </motion.div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-6">
        {/* Шапка профиля */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 rounded-2xl border shadow-sm ${cardBgClass} overflow-hidden`}
        >
          {/* Баннер */}
          <div className="h-56 sm:h-64 md:h-72 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 relative">
            {(team as any).banner_url && (
              <img
                src={(team as any).banner_url as string}
                alt="banner"
                className="absolute inset-0 h-full w-full object-cover opacity-80"
              />
            )}
            <div className="absolute inset-0 bg-black/20" />
          </div>

          {/* Тёмная полоса под баннером */}
          <div className="bg-slate-900 text-white">
            <div className="px-6 py-5">
              <div className="flex items-start justify-between gap-6">
                {/* Левая часть */}
                <div className="flex items-center gap-6 min-w-0">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="-mt-16 relative"
                  >
                    <div className="relative overflow-hidden rounded-2xl bg-white ring-4 ring-white shadow-xl
                    h-[88px] w-[88px] sm:h-[110px] sm:w-[110px] md:h-[120px] md:w-[120px]">
                      {team.avatar_url ? (
                        <img src={team.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-4xl bg-gradient-to-br from-blue-400 to-purple-600 text-white">
                          🦊
                        </div>
                      )}
                    </div>
                    {(team as any).verified && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.4, type: 'spring' }}
                        className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#4285f4] text-white shadow-lg"
                      >
                        <Check className="h-4 w-4" />
                      </motion.div>
                    )}
                  </motion.div>

                  {/* Название / ник / счётчики */}
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-3">
                      <h1 className="text-3xl font-bold truncate text-white">{team.name}</h1>
                    </div>
                    <div className="mb-3 text-[16px] text-slate-300">@{team.slug ?? team.id}</div>

                    <div className="flex flex-wrap items-center gap-6 text-[15px]">
                      <div className="flex items-center gap-2">
                        <Heart className="h-4 w-4 text-slate-400" />
                        <span className="font-semibold text-white">
                          {formatK((team as any).likes_count ?? 0)}
                        </span>
                        <span className="text-slate-400">лайков</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <UsersRound className="h-4 w-4 text-slate-400" />
                        <span className="font-semibold text-white">
                          {formatK((team as any).followers_count ?? 0)}
                        </span>
                        <span className="text-slate-400">подписчиков</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-slate-400" />
                        <span className="font-semibold text-white">{titles.length}</span>
                        <span className="text-slate-400">тайтлов</span>
                      </div>
                      {team.started_at && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-slate-400" />
                          <span className="text-slate-300">
                            с {new Date(team.started_at).getFullYear()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Правая часть */}
                <div className="flex shrink-0 items-center gap-3 relative">
                  {user && (
                    <motion.button
                      whileHover={{ scale: followPending ? 1 : 1.05 }}
                      whileTap={{ scale: followPending ? 1 : 0.95 }}
                      onClick={toggleFollow}
                      disabled={followPending}
                      className={`px-6 py-3 rounded-xl font-medium transition-all shadow-lg ${
                        isFollowing
                          ? 'bg-slate-800 text-white border-2 border-slate-700 hover:bg-slate-700'
                          : 'bg-[#2196F3] text-white hover:bg-[#1976D2] border-2 border-transparent'
                      } ${followPending ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {isFollowing ? '✓ Подписан' : 'Подписаться'}
                    </motion.button>
                  )}

                  {/* Поделиться */}
                  <div className="relative">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={copyLink}
                      className="p-3 rounded-xl border-2 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 shadow-sm"
                      title="Скопировать ссылку"
                    >
                      <Share2 className="h-4 w-4" />
                    </motion.button>

                    <AnimatePresence>
                      {copied && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          className="absolute right-0 -top-10 whitespace-nowrap rounded-lg bg-slate-900 text-white text-xs px-3 py-1 shadow-lg"
                        >
                          Ссылка скопирована
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {user && canEdit && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsEditOpen(true)}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 shadow-sm"
                    >
                      <Edit className="h-4 w-4" />
                      Редактировать
                    </motion.button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Табы */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className={`mb-6 rounded-2xl border ${cardBgClass} overflow-hidden`}>
          <div className="-mx-3 px-3 overflow-x-auto sm:overflow-visible">
            <div className="flex min-w-max sm:min-w-0">
              <Tab active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<Activity className="w-4 h-4" />}>
                Обзор
              </Tab>
              <Tab active={activeTab === 'titles'} onClick={() => setActiveTab('titles')} icon={<BookOpen className="w-4 h-4" />}>
                Переводят ({titles.length})
              </Tab>
              <Tab active={activeTab === 'posts'} onClick={() => setActiveTab('posts')} icon={<MessageCircle className="w-4 h-4" />}>
                Посты
              </Tab>
            </div>
          </div>
        </motion.div>

        {/* Контент табов */}
        <AnimatePresence initial={false} mode="sync">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 gap-6 lg:grid-cols-3"
            >
              {/* Левая колонка */}
              <div className="space-y-6">
                <Section>
                  <SectionTitle icon={<UsersIcon className="w-5 h-5" />}>О команде</SectionTitle>
                  {team.bio?.trim() && (
                    <AboutCollapser text={team.bio} theme={theme} collapsedHeight={220} />
                  )}

                  {(Array.isArray(team.tags) && team.tags.length > 0) && (
                    <>
                      <SectionTitle>Что переводят</SectionTitle>
                      <div className="mb-4 flex flex-wrap gap-2">
                        {(showAllTags ? team.tags : team.tags.slice(0, 6)).map((t, i) => (
                          <motion.span
                            key={`tag-${i}`}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                            className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                              theme === 'light'
                                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          >
                            {t}
                          </motion.span>
                        ))}

                        {team.tags.length > 6 && !showAllTags && (
                          <button
                            onClick={() => setShowAllTags(true)}
                            className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                              theme === 'light'
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                            }`}
                          >
                            +{team.tags.length - 6} еще
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  <SectionTitle className="mt-2">Направления перевода</SectionTitle>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {(team.langs?.length ? Array.from(new Set(team.langs)) : ['EN→RU']).map((lng, i) => (
                      <motion.span
                        key={`lang-${i}`}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 + 0.2 }}
                        className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                          theme === 'light'
                            ? 'bg-[#e3f2fd] text-[#1976D2]'
                            : 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                        }`}
                      >
                        {lng}
                      </motion.span>
                    ))}
                  </div>
                </Section>

                {/* Статистика */}
                <Section>
                  <SectionTitle icon={<TrendingUp className="w-5 h-5" />}>Статистика</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`${theme === 'light' ? 'bg-blue-50' : 'bg-blue-600/10'} p-4 rounded-lg`}>
                      <div className={`text-2xl font-bold ${theme === 'light' ? 'text-blue-900' : 'text-blue-400'}`}>
                        {formatK((team as any).stats_pages ?? 0)}
                      </div>
                      <div className={`text-sm ${theme === 'light' ? 'text-blue-600' : 'text-blue-300'}`}>Глав переведено</div>
                    </div>
                    <div className={`${theme === 'light' ? 'bg-green-50' : 'bg-green-600/10'} p-4 rounded-lg`}>
                      <div className={`text-2xl font-bold ${theme === 'light' ? 'text-green-900' : 'text-green-400'}`}>
                        {formatK((team as any).stats_inwork ?? 0)}
                      </div>
                      <div className={`text-sm ${theme === 'light' ? 'text-green-600' : 'text-green-300'}`}>В работе</div>
                    </div>
                  </div>
                </Section>
              </div>

              {/* Средняя колонка */}
              <div className="space-y-6">
                <Section>
                  <SectionTitle icon={<ExternalLink className="w-5 h-5" />}>Ресурсы</SectionTitle>
                  <div className="mb-6 flex flex-wrap gap-3">
                    {resources.length === 0 ? (
                      <div className={`text-[14px] ${mutedTextClass}`}>Ничего не указано</div>
                    ) : (
                      resources.map((r) => (
                        <motion.a
                          key={r.key}
                          href={r.href}
                          target="_blank"
                          rel="noreferrer"
                          whileHover={{ scale: 1.05, y: -2 }}
                          whileTap={{ scale: 0.95 }}
                          className={`inline-flex items-center gap-3 rounded-xl border px-4 py-3 font-medium transition-all hover:shadow-lg ${
                            theme === 'light'
                              ? 'border-slate-200 bg-white hover:bg-slate-50'
                              : 'border-slate-600 bg-slate-700/50 hover:bg-slate-600/50'
                          }`}
                        >
                          <span className={`flex h-6 w-6 items-center justify-center rounded ${r.color}`}>
                            <span className="text-[12px] font-bold text-white">{r.icon}</span>
                          </span>
                          <span className={textClass}>{r.key}</span>
                        </motion.a>
                      ))
                    )}
                  </div>

                  {/* Участники команды */}
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <SectionTitle className="!mb-0" icon={<UsersIcon className="w-5 h-5" />}>
                        Команда ({members.length})
                      </SectionTitle>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {(showAllMembers ? members : members.slice(0, 12)).map((m, idx) => {
                        const username = m.profile?.username || ''
                        const profileHref = username ? `/profile/${username}` : `/profile/${m.user_id}`
                        const label = roleLabel(m.role)

                        return (
                          <motion.a
                            key={`member-${m.user_id}`} // стабильный ключ
                            href={profileHref}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            whileHover={{ scale: 1.05, y: -5 }}
                            className="flex flex-col items-center text-center group cursor-pointer p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-all"
                          >
                            {/* Аватар */}
                            <div
                              className={`w-16 h-16 overflow-hidden rounded-xl mb-2 ring-2 transition-all group-hover:ring-4 flex-shrink-0 ${
                                theme === 'light'
                                  ? 'bg-slate-200 ring-slate-300 group-hover:ring-blue-300'
                                  : 'bg-slate-700 ring-slate-600 group-hover:ring-blue-500'
                              }`}
                            >
                              {m.profile?.avatar_url ? (
                                <img
                                  src={m.profile.avatar_url}
                                  alt={`${username} avatar`}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  onError={(e) => { 
                                    (e.currentTarget as HTMLImageElement).src = '/avatar-placeholder.png' 
                                  }}
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-2xl">
                                  👤
                                </div>
                              )}
                            </div>

                            {/* Имя пользователя */}
                            <div className={`text-[13px] font-medium ${textClass} mb-1 break-words max-w-full`}>
                              {username || '—'}
                            </div>
                            
                            {/* Роль */}
                            {label && (
                              <div className={`text-[11px] font-medium px-2 py-1 rounded-full border text-center min-w-0 ${
                                theme === 'light' ? getRoleColor(m.role) : getRoleColorDark(m.role)
                              }`}>
                                {label}
                              </div>
                            )}
                          </motion.a>
                        )
                      })}
                      
                      {/* Кнопка "показать еще" */}
                      {members.length > 12 && !showAllMembers && (
                        <div className="flex flex-col items-center text-center p-2">
                          <motion.button
                            onClick={() => setShowAllMembers(true)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center text-lg transition-colors ${
                              theme === 'light'
                                ? 'border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50'
                                : 'border-slate-600 text-slate-500 hover:border-blue-500 hover:text-blue-400 hover:bg-blue-900/20'
                            }`}
                          >
                            +{members.length - 12}
                          </motion.button>
                          <div className={`text-[11px] ${mutedTextClass} mt-2`}>
                            Еще
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Section>
              </div>

              {/* Правая колонка */}
              <div className="space-y-6">
                <Section>
                  <SectionTitle icon={<Award className="w-5 h-5" />}>Топ подписчиков</SectionTitle>
                  <div className="space-y-3">
                    {members.slice(0, 5).map((m, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          theme === 'light' ? 'hover:bg-gray-50' : 'hover:bg-slate-700/50'
                        }`}
                      >
                        <div className="relative">
                          <div className={`h-10 w-10 overflow-hidden rounded-full ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-600'}`}>
                            {m.profile?.avatar_url ? (
                              <img src={m.profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-sm">👤</div>
                            )}
                          </div>
                          {i < 3 && (
                            <div
                              className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs flex items-center justify-center ${
                                i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : 'bg-orange-500'
                              } text-white`}
                            >
                              {i + 1}
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className={`text-[14px] font-medium ${textClass}`}>{m.profile?.username || '—'}</div>
                          <div className={`text-[12px] ${mutedTextClass}`}>{roleLabel(m.role)}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                          <span className={`text-xs font-medium ${textClass}`}>{Math.floor(Math.random() * 100) + 50}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </Section>

                {/* Блок найма */}
                {((team as any).hiring_text || (team as any).hiring_enabled === false) && (
                  <Section>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`rounded-lg border p-4 ${
                        theme === 'light' ? 'border-amber-200 bg-amber-50' : 'border-amber-600/30 bg-amber-600/10'
                      }`}
                    >
                      {(team as any).hiring_enabled === false ? (
                        <>
                          <h4 className={`mb-2 font-semibold flex items-center gap-2 ${theme === 'light' ? 'text-amber-800' : 'text-amber-400'}`}>
                            <UsersIcon className="w-4 h-4" />
                            Команда укомплектована
                          </h4>
                          <p className={`text-[14px] ${theme === 'light' ? 'text-amber-700' : 'text-amber-300'}`}>
                            Сейчас набор закрыт.
                          </p>
                        </>
                      ) : (
                        <>
                          <h4 className={`mb-2 font-semibold flex items-center gap-2 ${theme === 'light' ? 'text-amber-800' : 'text-amber-400'}`}>
                            <UsersIcon className="w-4 h-4" />
                            Мы ищем таланты!
                          </h4>
                          <p className={`text-[14px] ${theme === 'light' ? 'text-amber-700' : 'text-amber-300'}`}>
                            {(team as any).hiring_text ?? 'Нужен тайлсеттер'}
                          </p>
                        </>
                      )}

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`mt-3 w-full rounded-lg py-2 text-sm font-medium transition-colors ${
                          theme === 'light'
                            ? 'bg-amber-200 text-amber-800 hover:bg-amber-300'
                            : 'bg-amber-600/20 text-amber-300 border border-amber-600/30 hover:bg-amber-600/30'
                        }`}
                        onClick={() => {}}
                      >
                        Связаться с командой
                      </motion.button>
                    </motion.div>
                  </Section>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'titles' && (
            <motion.div
              key="titles"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <Section>
                <SectionTitle icon={<BookOpen className="w-5 h-5" />}>Переводимые тайтлы ({titles.length})</SectionTitle>

                {loadingTitles ? (
                  <div className="text-center py-8">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-3"
                    />
                    <p className={`text-sm ${mutedTextClass}`}>Загружаем тайтлы...</p>
                  </div>
                ) : titles.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-4">📚</div>
                    <p className={`text-lg ${mutedTextClass} mb-2`}>Пока нет переводимых тайтлов</p>
                    <p className={`text-sm ${mutedTextClass}`}>Команда еще не начала работу над проектами</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:gap-6 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                    {titles.map((t, index) => (
                      <motion.a
                        key={t.id}
                        href={`/manga/${t.id}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        whileHover={{ y: -8, scale: 1.02 }}
                        className={`group block overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-lg ${
                          theme === 'light' ? 'border-slate-200 bg-white hover:border-blue-300' : 'border-slate-700 bg-slate-800/60 hover:border-blue-500'
                        }`}
                      >
                        <div className="aspect-[3/4] w-full overflow-hidden bg-slate-100 relative">
                          {t.cover_url ? (
                            <img src={t.cover_url} alt={t.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-110" />
                          ) : (
                            <div className={`grid h-full place-items-center ${mutedTextClass}`}>
                              <BookOpen className="w-8 h-8" />
                            </div>
                          )}

                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="absolute bottom-2 left-2 right-2">
                              {Number.isFinite(Number(t.rating)) && (
                                <div className="flex items-center gap-1 mb-1">
                                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                  <span className="text-xs text-white font-medium">{Number(t.rating).toFixed(1)}</span>
                                </div>
                              )}
                              {t.chapters_count ? <div className="text-xs text-white">{t.chapters_count} глав</div> : null}
                            </div>
                          </div>

                          {t.status && (
                            <div className="absolute top-2 left-2">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  t.status === 'ongoing'
                                    ? 'bg-green-500 text-white'
                                    : t.status === 'completed'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-orange-500 text-white'
                                }`}
                              >
                                {t.status === 'ongoing' ? 'Онгоинг' : t.status === 'completed' ? 'Завершен' : t.status}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="p-2.5 sm:p-3">
                          <div className={`truncate text-[12px] sm:text-[13px] font-medium mb-1 ${textClass}`}>{t.name}</div>
                          {t.last_update && (
                            <div className={`text-[11px] ${mutedTextClass} flex items-center gap-1`}>
                              <Clock className="w-3 h-3" />
                              {new Date(t.last_update).toLocaleDateString('ru-RU')}
                            </div>
                          )}
                        </div>
                      </motion.a>
                    ))}
                  </div>
                )}
              </Section>
            </motion.div>
          )}

          {activeTab === 'posts' && (
            <motion.div
              key="posts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <TeamPosts
                teamSlug={slug}
                teamId={(team as any).id}
                canPost={(() => {
                  const m = members.find(m => m.user_id === user?.id)
                  const isLead = ['lead','leader','owner'].includes(String(m?.role).toLowerCase())
                  const isAdmin = String(profile?.role).toLowerCase() === 'admin'
                  return !!user && (isLead || isAdmin)
                })()}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* === Edit Modal === */}
      {isEditOpen && canEdit && (
        <EditModal
          initial={{
            name: team.name ?? '',
            avatar_url: team.avatar_url ?? '',
            banner_url: (team as any).banner_url ?? null,
            bio: team.bio ?? '',
            hiring_enabled: (team as any).hiring_enabled ?? !!(team as any).hiring_text,
            hiring_text: (team as any).hiring_text ?? null,
            discord_enabled: !!(team as any).discord_url,
            discord_url: (team as any).discord_url ?? null,
            boosty_enabled: !!(team as any).boosty_url,
            boosty_url: (team as any).boosty_url ?? null,
            telegram_enabled: !!(team as any).telegram_url,
            telegram_url: (team as any).telegram_url ?? null,
            vk_enabled: !!(team as any).vk_url,
            vk_url: (team as any).vk_url ?? null,
            langs: team.langs ?? ['EN→RU'],
            tags: team.tags ?? [],
            members: members.map((m) => ({
              username: m.profile?.username ?? '',
              role: m.role || 'translator'
            }))
          }}
          onClose={() => setIsEditOpen(false)}
          onSave={async (v) => {
            try {
              if (DEV) console.log('Saving team data:', v)
          
              // Подготавливаем данные для отправки
              const payload: any = {
                name: v.name.trim(),
                bio: v.bio.trim() || null,
                hiring_text: v.hiring_enabled ? (v.hiring_text?.trim() || null) : null,
                hiring_enabled: v.hiring_enabled,
                langs: v.langs.length ? v.langs : ['EN→RU'],
                tags: v.tags,
              }
          
              // Обязательные поля
              if (v.avatar_url.trim()) {
                payload.avatar_url = v.avatar_url.trim()
              }
              if (v.banner_url?.trim()) {
                payload.banner_url = v.banner_url.trim()
              }
          
              // Всегда отправляем URL-поля; если выключено — чистим в БД
              payload.discord_url  = v.discord_enabled  ? (v.discord_url?.trim()  || null) : null
              payload.boosty_url   = v.boosty_enabled   ? (v.boosty_url?.trim()   || null) : null
              payload.telegram_url = v.telegram_enabled ? (v.telegram_url?.trim() || null) : null
              payload.vk_url       = v.vk_enabled       ? (v.vk_url?.trim()       || null) : null
          
              if (DEV) console.log('Final payload:', payload)
          
              const rTeam = await fetch(`/api/teams/${encodeURIComponent(slug)}/edit`, {
                method: 'PATCH',
                headers: { 
                  'Content-Type': 'application/json',
                  ...(DEV && user?.id ? { 'x-user-id': user.id } : {}),
                },
                body: JSON.stringify(payload),
              })

              if (!rTeam.ok) {
                const errorData = await rTeam.json().catch(() => ({}))
                if (DEV) console.error('Team update failed:', errorData)
                
                let errorMessage = 'Не удалось обновить команду'
                if (errorData.error === 'invalid_urls') {
                  errorMessage = 'Проверьте правильность введенных URL-адресов'
                } else if (errorData.error === 'forbidden') {
                  errorMessage = 'У вас нет прав для редактирования этой команды'
                } else if (errorData.error === 'unauthorized') {
                  errorMessage = 'Необходимо войти в аккаунт'
                } else if (errorData.message) {
                  errorMessage = errorData.message
                }
                throw new Error(errorMessage)
              }
          
              const teamResult = await rTeam.json()
              if (DEV) console.log('Team update result:', teamResult)
          
              // Обновляем участников (если есть изменения)
              if (v.members && v.members.length > 0) {
                if (DEV) console.log('Updating members:', v.members)
          
                const rMembers = await fetch(`/api/teams/${encodeURIComponent(slug)}/members`, {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    ...(DEV && user?.id ? { 'x-user-id': user.id } : {}),
                  },
                  body: JSON.stringify({ members: v.members }),
                })
          
                if (rMembers.ok) {
                  const membersResult = await rMembers.json()
                  if (DEV) console.log('Members update result:', membersResult)
                  
                  if (Array.isArray(membersResult?.items)) {
                    setMembers(membersResult.items)
                  }
                } else {
                  if (DEV) console.warn('Members update failed, but team data was saved')
                }
              }
          
              // Обновляем состояние команды
              setTeam(prevTeam => prevTeam ? { 
                ...prevTeam, 
                ...teamResult.team,
                followers_count: (prevTeam as any).followers_count,
                i_follow: (prevTeam as any).i_follow
              } : prevTeam)
              
              setIsEditOpen(false)
              if (DEV) console.log('Команда успешно обновлена!')
              
            } catch (e) {
              const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Неизвестная ошибка'
              if (DEV) console.error('[Edit save]', e)
              alert(`Ошибка: ${msg}`)
            }
          }}
        />
      )}
    </div>
  )
}

/* ========= Modal / helpers / utils ========= */
type EditModalProps = {
  initial: EditValues
  onClose: () => void
  onSave: (v: EditValues) => Promise<void>
}

const EditModal: React.FC<EditModalProps> = ({ initial, onClose, onSave }) => {
  const { theme } = useTheme()
  const [v, setV] = useState<EditValues>(initial)
  const [saving, setSaving] = useState(false)

  const toggleSet = (key: 'langs' | 'tags', value: string) => {
    setV((prev) => {
      const set = new Set(prev[key])
      set.has(value) ? set.delete(value) : set.add(value)
      return { ...prev, [key]: Array.from(set) } as EditValues
    })
  }

  const addMember = () => {
    setV((prev) => ({ ...prev, members: [...prev.members, { username: '', role: 'translator' }] }))
  }  

  const removeMember = (idx: number) => {
    setV((prev) => ({ ...prev, members: prev.members.filter((_, i) => i !== idx) }))
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(v)
    } finally {
      setSaving(false)
    }
  }

  const modalBg = theme === 'light' ? 'bg-white' : 'bg-slate-800'
  const inputClass =
    theme === 'light'
      ? 'bg-white border-slate-200 text-gray-900 focus:ring-blue-500'
      : 'bg-slate-700 border-slate-600 text-white focus:ring-blue-500'

  const Label: React.FC<{children: React.ReactNode}> = ({ children }) => (
    <label className={`mb-1 block text-xs font-medium uppercase tracking-wide ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>{children}</label>
  )

  const Toggle: React.FC<{checked: boolean; onChange: (v:boolean)=>void}> = ({ checked, onChange }) => (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-14 items-center rounded-full transition ${checked ? 'bg-blue-600' : 'bg-slate-600'}`}
    >
      <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  )

  const UrlField: React.FC<{
    label: string
    enabled: boolean
    value: string | null
    placeholder: string
    onToggle: (v:boolean)=>void
    onChange: (v:string)=>void
  }> = ({ label, enabled, value, placeholder, onToggle, onChange }) => (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label>{label}</Label>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      <input
        className={`w-full rounded-2xl border px-3 py-2.5 text-[14px] shadow-sm outline-none transition focus:ring-4 ${inputClass}`}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={!enabled}
      />
    </div>
  )

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={`relative w-[min(860px,92vw)] max-h-[90vh] overflow-hidden rounded-3xl shadow-2xl ring-1 ring-black/5 ${modalBg}`}
        >
          <div
            className={`flex items-center justify-between border-b px-6 py-4 ${
              theme === 'light' ? 'border-slate-200 bg-gradient-to-r from-sky-50 to-indigo-50' : 'border-slate-700 bg-gradient-to-r from-slate-800 to-slate-700'
            }`}
          >
            <h3 className={`text-lg font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Редактировать команду</h3>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              type="button"
              className={`rounded-full p-2 transition ${theme === 'light' ? 'text-slate-500 hover:bg-white hover:text-slate-700' : 'text-slate-400 hover:bg-slate-600 hover:text-white'}`}
              onClick={() => !saving && onClose()}
            >
              <X className="h-5 w-5" />
            </motion.button>
          </div>

          <form className="max-h-[calc(90vh-80px)] space-y-6 overflow-y-auto px-6 py-6" onSubmit={submit}>
            {/* Базовая информация */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Название</Label>
                <input
                  className={`w-full rounded-2xl border px-3 py-2.5 text-[14px] shadow-sm outline-none transition focus:ring-4 ${inputClass}`}
                  value={v.name}
                  onChange={e => setV({ ...v, name: e.target.value })}
                  placeholder="Название команды"
                  required
                />
              </div>
              <div>
                <Label>Аватар URL</Label>
                <input
                  className={`w-full rounded-2xl border px-3 py-2.5 text-[14px] shadow-sm outline-none transition focus:ring-4 ${inputClass}`}
                  value={v.avatar_url}
                  onChange={e => setV({ ...v, avatar_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>Баннер URL</Label>
                <input
                  className={`w-full rounded-2xl border px-3 py-2.5 text-[14px] shadow-sm outline-none transition focus:ring-4 ${inputClass}`}
                  value={v.banner_url ?? ''}
                  onChange={e => setV({ ...v, banner_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="md:col-span-2">
                <Label>Описание</Label>
                <textarea
                  className={`w-full rounded-2xl border px-3 py-2.5 text-[14px] shadow-sm outline-none transition focus:ring-4 ${inputClass}`}
                  rows={4}
                  value={v.bio}
                  onChange={e => setV({ ...v, bio: e.target.value })}
                  placeholder="Пара слов о команде…"
                />
              </div>
            </div>

            {/* Ресурсы */}
            <div className="grid gap-4 md:grid-cols-2">
              <UrlField
                label="Discord"
                enabled={v.discord_enabled}
                value={v.discord_url}
                placeholder="https://discord.gg/..."
                onToggle={(en) => setV({ ...v, discord_enabled: en })}
                onChange={(val) => setV({ ...v, discord_url: val })}
              />
              <UrlField
                label="Boosty"
                enabled={v.boosty_enabled}
                value={v.boosty_url}
                placeholder="https://boosty.to/..."
                onToggle={(en) => setV({ ...v, boosty_enabled: en })}
                onChange={(val) => setV({ ...v, boosty_url: val })}
              />
              <UrlField
                label="Telegram"
                enabled={v.telegram_enabled}
                value={v.telegram_url}
                placeholder="https://t.me/..."
                onToggle={(en) => setV({ ...v, telegram_enabled: en })}
                onChange={(val) => setV({ ...v, telegram_url: val })}
              />
              <UrlField
                label="VK"
                enabled={v.vk_enabled}
                value={v.vk_url}
                placeholder="https://vk.com/..."
                onToggle={(en) => setV({ ...v, vk_enabled: en })}
                onChange={(val) => setV({ ...v, vk_url: val })}
              />
            </div>

            {/* Набор */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label>Набор открыт</Label>
                  <Toggle
                    checked={v.hiring_enabled}
                    onChange={(en) => setV({ ...v, hiring_enabled: en })}
                  />
                </div>
                <textarea
                  className={`w-full rounded-2xl border px-3 py-2.5 text-[14px] shadow-sm outline-none transition focus:ring-4 ${inputClass}`}
                  rows={3}
                  value={v.hiring_text ?? ''}
                  onChange={e => setV({ ...v, hiring_text: e.target.value })}
                  placeholder="Кого ищем и как связаться…"
                  disabled={!v.hiring_enabled}
                />
              </div>

              {/* Языки / Теги */}
              <div className="grid gap-4">
                <div>
                  <Label>Языки</Label>
                  <div className="flex flex-wrap gap-2">
                    {['EN→RU', 'JP→RU', 'KR→RU', 'CN→RU'].map((lng) => {
                      const active = v.langs.includes(lng)
                      return (
                        <button
                          key={lng}
                          type="button"
                          onClick={() => toggleSet('langs', lng)}
                          className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                            active
                              ? 'bg-blue-600 text-white'
                              : theme === 'light'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {lng}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <Label>Теги</Label>
                  <div className="flex flex-wrap gap-2">
                    {['Манга', 'Манхва', 'Новелла', 'Другое'].map((tg) => {
                      const active = v.tags.includes(tg)
                      return (
                        <button
                          key={tg}
                          type="button"
                          onClick={() => toggleSet('tags', tg)}
                          className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                            active
                              ? 'bg-emerald-600 text-white'
                              : theme === 'light'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {tg}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Участники */}
            <div>
              <Label>Участники</Label>
              <div className="space-y-3">
                {v.members.map((m, idx) => (
                  <div key={idx} className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
                    <input
                      className={`w-full rounded-2xl border px-3 py-2.5 text-[14px] shadow-sm outline-none transition focus:ring-4 ${inputClass}`}
                      placeholder="username"
                      value={m.username}
                      onChange={e => {
                        const val = e.target.value
                        setV(prev => ({
                          ...prev,
                          members: prev.members.map((x, i) => i === idx ? { ...x, username: val } : x)
                        }))
                      }}
                    />
                    <select
                      className={`w-full rounded-2xl border px-3 py-2.5 text-[14px] shadow-sm outline-none transition ${inputClass}`}
                      value={m.role}
                      onChange={e => {
                        const val = e.target.value
                        setV(prev => ({
                          ...prev,
                          members: prev.members.map((x, i) => i === idx ? { ...x, role: val } : x)
                        }))
                      }}
                    >
                      {['leader','editor','translator','typesetter','member'].map(r => (
                        <option key={r} value={r}>{roleLabel(r) ?? r}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeMember(idx)}
                      className="inline-flex items-center justify-center rounded-2xl border px-3 py-2.5 text-[14px] text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addMember}
                className={[
                  "mt-3 inline-flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-[14px] transition-colors",
                  theme === "light"
                    ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                    : "border-slate-600 text-slate-200 hover:bg-slate-700/40"
                ].join(" ")}
              >
                <Plus className="w-4 h-4" />
                Добавить участника
              </button>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => !saving && onClose()}
                className={[
                  "rounded-2xl border px-4 py-2.5 text-[14px] transition-colors",
                  theme === "light"
                    ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                    : "border-slate-600 text-slate-200 hover:bg-slate-700/40"
                ].join(" ")}
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-blue-600 px-5 py-2.5 text-[14px] font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ========= UI helpers ========= */
function Tab({
  children,
  active = false,
  onClick,
  icon
}: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  icon?: React.ReactNode
}) {
  const { theme } = useTheme()

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: active ? 0 : -2 }}
      whileTap={{ scale: 0.98 }}
      className={[
        'relative flex items-center gap-2 px-6 py-4 font-medium transition-all',
        active
          ? 'text-[#2196F3] bg-gradient-to-b from-blue-50 to-white border-b-2 border-[#2196F3]'
          : theme === 'light'
          ? 'text-slate-600 hover:text-slate-900 hover:bg-gray-50'
          : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
      ].join(' ')}
    >
      {icon}
      {children}
    </motion.button>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-6 shadow-sm ${
        theme === 'light' ? 'bg-white border-gray-200' : 'bg-slate-800/60 border-slate-700'
      }`}
    >
      {children}
    </motion.div>
  )
}

function SectionTitle({
  children,
  className = '',
  icon
}: {
  children: React.ReactNode
  className?: string
  icon?: React.ReactNode
}) {
  const { theme } = useTheme()
  return (
    <h2 className={['mb-4 text-[18px] font-semibold flex items-center gap-2', theme === 'light' ? 'text-slate-900' : 'text-white', className].join(' ')}>
      {icon}
      {children}
    </h2>
  )
}

/* ========= utils ========= */
function roleLabel(role?: string | null) {
  const r = String(role || '').toLowerCase()
  switch (r) {
    case 'lead':
    case 'leader':      return 'Лидер'
    case 'editor':      return 'Редактор'
    case 'translator':  return 'Переводчик'
    case 'typesetter':  return 'Тайпсеттер'
    case 'member':      return 'Участник'
    default:            return null // возвращаем null если роль неизвестна
  }
}

function getRoleColor(role?: string | null) {
  const r = String(role || '').toLowerCase()
  switch (r) {
    case 'lead':
    case 'leader':      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'editor':      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'translator':  return 'bg-green-100 text-green-700 border-green-200'
    case 'typesetter':  return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'member':      return 'bg-gray-100 text-gray-600 border-gray-200'
    default:            return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

// Для темной темы
function getRoleColorDark(role?: string | null) {
  const r = String(role || '').toLowerCase()
  switch (r) {
    case 'lead':
    case 'leader':      return 'bg-amber-900/30 text-amber-300 border-amber-700/50'
    case 'editor':      return 'bg-blue-900/30 text-blue-300 border-blue-700/50'
    case 'translator':  return 'bg-green-900/30 text-green-300 border-green-700/50'
    case 'typesetter':  return 'bg-purple-900/30 text-purple-300 border-purple-700/50'
    case 'member':      return 'bg-gray-700/30 text-gray-300 border-gray-600/50'
    default:            return 'bg-slate-700/30 text-slate-300 border-slate-600/50'
  }
}

function formatK(n: number) {
  if (n >= 1000) {
    const k = (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace('.0', '')
    return `${k}K`
  }
  return String(n)
}
