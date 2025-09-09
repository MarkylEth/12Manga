'use client'

import { formatK } from '@/lib/team/format'
import { useTheme } from '@/lib/theme/context'

export default function TeamOverview({ team }: { team: any }) {
  const { theme } = useTheme()
  const muted  = theme === 'light' ? 'text-slate-600' : 'text-slate-300'
  const text   = theme === 'light' ? 'text-slate-900' : 'text-white'

  return (
    <div className="space-y-4">
      {team.bio && (
        <p className={`whitespace-pre-line text-sm ${muted}`}>{team.bio}</p>
      )}
      <div className={`flex flex-wrap gap-6 text-sm ${muted}`}>
        <span>👍 <span className={`font-semibold ${text}`}>{formatK(team.likes_count ?? 0)}</span></span>
        <span>👥 <span className={`font-semibold ${text}`}>{formatK(team.followers_count ?? 0)}</span></span>
      </div>
    </div>
  )
}
