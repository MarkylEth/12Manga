'use client'

import { useTheme } from '@/lib/theme/context'

export default function TeamResources({ team }: { team: any }) {
  const { theme } = useTheme()
  const btn = theme === 'light'
    ? 'border-slate-200 bg-white hover:bg-slate-50'
    : 'border-slate-600 bg-slate-700/50 hover:bg-slate-600/50'

  const links = [
    { url: team.discord_url, label: 'Discord', badge: 'D' },
    { url: team.boosty_url,  label: 'Boosty',  badge: 'B' },
    { url: team.telegram_url,label: 'Telegram',badge: 'TG' },
    { url: team.vk_url,      label: 'VK',      badge: 'VK' },
  ].filter(l => l.url)

  if (!links.length) return <div className="text-sm text-slate-400">Ничего не указано</div>

  return (
    <div className="flex flex-wrap gap-3">
      {links.map((l) => (
        <a key={l.label} href={l.url} target="_blank" rel="noreferrer"
           className={`inline-flex items-center gap-3 rounded-xl border px-4 py-3 font-medium transition-all hover:shadow-sm ${btn}`}>
          <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-900 text-white text-[12px]">{l.badge}</span>
          {l.label}
        </a>
      ))}
    </div>
  )
}
