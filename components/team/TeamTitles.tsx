'use client'

import { TeamTitle } from '@/lib/team/titles'

export default function TeamTitles({ titles }: { titles: TeamTitle[] }) {
  if (!titles.length) return null

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Тайтлы</h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {titles.map(t => (
          <li key={t.id} className="space-y-1">
            {t.cover_url && (
              <img src={t.cover_url} alt={t.name} className="w-full rounded" />
            )}
            <div className="text-sm font-medium line-clamp-2">{t.name}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}