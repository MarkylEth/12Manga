'use client'
import React from 'react' 
import { useTheme } from '@/lib/theme/context'
import { roleLabel, getRoleColor, getRoleColorDark } from '@/lib/team/roles'

type Member = {
  user_id: string
  role: string
  profile: { id: string; username: string | null; avatar_url: string | null } | null
}

export default function TeamMembers({ members }: { members: Member[] }) {
  const { theme } = useTheme()
  const [showAll, setShowAll] = React.useState(false)
  if (!members.length) return <div className="text-sm text-slate-400">Пока пусто</div>

  const take = showAll ? members : members.slice(0, 12)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
      {take.map((m, idx) => {
        const label = roleLabel(m.role)
        return (
          <a key={m.user_id} href={m.profile?.username ? `/profile/${m.profile.username}` : `/profile/${m.user_id}`}
             className="flex flex-col items-center text-center group cursor-pointer p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-all">
            <div className={`w-16 h-16 overflow-hidden rounded-xl mb-2 ring-2 transition-all group-hover:ring-4 ${
              theme === 'light'
                ? 'bg-slate-200 ring-slate-300 group-hover:ring-blue-300'
                : 'bg-slate-700 ring-slate-600 group-hover:ring-blue-500'
            }`}>
              {m.profile?.avatar_url
                ? <img src={m.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                : <div className="grid h-full place-items-center text-2xl">👤</div>}
            </div>
            <div className={`text-[13px] font-medium ${theme === 'light' ? 'text-slate-900' : 'text-white'} mb-1 truncate max-w-full`}>
              {m.profile?.username || '—'}
            </div>
            {label && (
              <div className={`text-[11px] font-medium px-2 py-1 rounded-full border ${
                theme === 'light' ? getRoleColor(m.role) : getRoleColorDark(m.role)
              }`}>
                {label}
              </div>
            )}
          </a>
        )
      })}

      {members.length > 12 && !showAll && (
        <div className="flex flex-col items-center text-center p-2">
          <button
            onClick={() => setShowAll(true)}
            className={`w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center text-lg ${
              theme === 'light'
                ? 'border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50'
                : 'border-slate-600 text-slate-500 hover:border-blue-500 hover:text-blue-400 hover:bg-blue-900/20'
            }`}
          >
            +{members.length - 12}
          </button>
          <div className={`text-[11px] ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} mt-2`}>Еще</div>
        </div>
      )}
    </div>
  )
}
