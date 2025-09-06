'use client'

import { ReactNode } from 'react'
import { useTheme } from '@/lib/theme/context'
import { Shield } from 'lucide-react'

interface ProtectedRouteProps {
  children: ReactNode
  /** раньше требовалась авторизация — сейчас игнорируется */
  requireAuth?: boolean
  /** раньше проверяли роль — сейчас игнорируется */
  requireRole?: 'admin' | 'moderator'
  /** раньше редирект — теперь не используется */
  redirectTo?: string
  /** не используется */
  fallback?: ReactNode
}

/**
 * Auth выпилен. Роут всегда доступен.
 * Чтобы сохранить UX, при запросе защищённых секций показываем ненавязчивую плашку.
 */
export function ProtectedRoute({
  children,
  requireAuth,
  requireRole,
}: ProtectedRouteProps) {
  const { theme } = useTheme()

  const showNotice = !!requireAuth || !!requireRole
  const bg = theme === 'light' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-amber-500/10 border-amber-400/30 text-amber-200'

  return (
    <>
      {showNotice && (
        <div className={`mx-auto mb-3 max-w-6xl rounded-xl border ${bg} px-3 py-2 text-sm`}>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Доступ к разделу больше не требует авторизации — проверки отключены на время миграции.
          </div>
        </div>
      )}
      {children}
    </>
  )
}

export default ProtectedRoute
