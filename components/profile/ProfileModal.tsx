'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User, Mail, Shield, Calendar, Settings, AlertCircle, CheckCircle, LogOut } from 'lucide-react'
import { useTheme } from '@/lib/theme/context'

interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

type ProfileOk = {
  ok: true
  user: { id: string; email: string; registered_at: string }
  profile: { nickname: string; role: string; avatar_url: string | null }
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { theme } = useTheme()

  const textClass = theme === 'light' ? 'text-gray-900' : 'text-white'
  const mutedTextClass = theme === 'light' ? 'text-gray-600' : 'text-slate-400'
  const bgClass = theme === 'light' ? 'bg-white border-gray-200' : 'bg-slate-800 border-slate-700'
  const tabActiveClass =
    theme === 'light' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-blue-500/20 text-blue-400 border-blue-500/50'
  const tabInactiveClass = theme === 'light' ? 'text-gray-500 hover:text-gray-700' : 'text-slate-400 hover:text-slate-200'

  const [activeTab, setActiveTab] = useState<'profile' | 'settings'>('profile')

  // === профайл ===
  const [loading, setLoading] = useState(false)
  const [isGuest, setIsGuest] = useState(true)
  const [data, setData] = useState<ProfileOk | null>(null)
  const [error, setError] = useState<string | null>(null)

  // === logout ===
  const [signingOut, setSigningOut] = useState(false)
  async function handleLogout() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {}
    finally {
      onClose?.()
      // сбрасываем клиентское состояние самым надёжным способом
      window.location.reload()
    }
  }

  // Загружаем профиль при открытии
  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!isOpen) return
      setLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/profile', { credentials: 'include' })

        if (res.status === 401) {
          if (!cancelled) {
            setIsGuest(true)
            setData(null)
          }
          return
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new Error(`/api/profile ${res.status} ${res.statusText} — ${body.slice(0, 200)}`)
        }

        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) {
          const body = await res.text().catch(() => '')
          throw new Error(`Ожидался JSON, пришло "${ct}". Фрагмент: ${body.slice(0, 200)}`)
        }

        const json = (await res.json()) as ProfileOk
        if (!cancelled) {
          setData(json)
          setIsGuest(false)
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'network_error')
          setIsGuest(true)
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const displayName = useMemo(() => {
    if (isGuest || !data) return 'Гость'
    return data.profile?.nickname || data.user.email.split('@')[0]
  }, [isGuest, data])

  const email = isGuest || !data ? '—' : data.user.email
  const role = isGuest || !data ? 'Гость' : data.profile?.role || 'user'
  const registeredAt =
    isGuest || !data ? '—' : new Date(data.user.registered_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${bgClass}`}
        >
          <div className="p-8">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className={`text-2xl font-bold ${textClass}`}>Мой профиль</h2>
                <p className={`text-sm ${mutedTextClass}`}>
                  {loading ? 'Загрузка…' : isGuest ? 'Вы гость' : 'Вы авторизованы'}
                </p>
                {error && <p className="mt-1 text-sm text-red-500">Ошибка: {error}</p>}
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className={theme === 'light' ? 'rounded-full p-2 text-gray-500 hover:bg-gray-100' : 'rounded-full p-2 text-slate-300 hover:bg-slate-700'}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </motion.button>
            </div>

            {/* Tabs */}
            <div className="mb-8 flex gap-1">
              <button
                onClick={() => setActiveTab('profile')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'profile' ? tabActiveClass : tabInactiveClass}`}
              >
                <User className="mr-2 inline h-4 w-4" />
                Профиль
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'settings' ? tabActiveClass : tabInactiveClass}`}
              >
                <Settings className="mr-2 inline h-4 w-4" />
                Настройки
              </button>
            </div>

            {activeTab === 'profile' ? (
              <div className="space-y-8">
                <div className="flex flex-col items-center gap-6 sm:flex-row">
                  <div className="relative">
                    <div className="relative h-24 w-24 overflow-hidden rounded-full bg-gradient-to-br from-blue-500 to-purple-600 ring-4 ring-blue-500/20">
                      <div className="grid h-full w-full place-items-center">
                        <User className="h-10 w-10 text-white" />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 text-center sm:text-left">
                    <h3 className={`text-xl font-bold ${textClass}`}>{displayName}</h3>
                    <div className="mt-1 flex items-center justify-center gap-2 sm:justify-start">
                      <Mail className={`h-4 w-4 ${mutedTextClass}`} />
                      <span className={`text-sm ${mutedTextClass}`}>{email}</span>
                    </div>
                    <div className="mt-3 flex justify-center sm:justify-start">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-1 text-xs font-semibold text-white">
                        <Shield className="h-3 w-3" />
                        {role}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-2 sm:justify-start">
                      <Calendar className={`h-4 w-4 ${mutedTextClass}`} />
                      <span className={`text-sm ${mutedTextClass}`}>Регистрация: {registeredAt}</span>
                    </div>
                  </div>
                </div>

                {isGuest ? (
                  <div className="space-y-3">
                    <div className={`flex items-start gap-3 rounded-xl border p-4 ${theme === 'light' ? 'border-yellow-200 bg-yellow-50' : 'border-yellow-500/30 bg-yellow-500/10'}`}>
                      <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                      <div className="text-sm">Чтобы получить доступ к настройкам аккаунта — войдите.</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className={`flex items-start gap-3 rounded-xl border p-4 ${theme === 'light' ? 'border-emerald-200 bg-emerald-50' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
                      <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      <div className="text-sm">Вы вошли в систему.</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <h3 className={`text-lg font-semibold ${textClass}`}>Управление аккаунтом</h3>

                {isGuest ? (
                  <div className={`rounded-xl border p-4 ${theme === 'light' ? 'border-gray-200 bg-gray-50' : 'border-slate-600 bg-slate-700/50'}`}>
                    <p className={`text-sm ${mutedTextClass}`}>Войдите, чтобы увидеть настройки.</p>
                  </div>
                ) : (
                  <>
                    <div className={`rounded-xl border p-4 ${theme === 'light' ? 'border-gray-200 bg-gray-50' : 'border-slate-600 bg-slate-700/50'}`}>
                      <p className={`text-sm ${mutedTextClass}`}>Здесь появятся дополнительные настройки профиля.</p>
                    </div>

                    <div className="flex justify-end">
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={handleLogout}
                        disabled={signingOut}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        <LogOut className="h-4 w-4" />
                        {signingOut ? 'Выходим…' : 'Выйти'}
                      </motion.button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
