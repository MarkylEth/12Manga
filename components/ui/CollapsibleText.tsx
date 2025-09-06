'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTheme } from '@/lib/theme/context'

export default function CollapsibleText({
  children,
  collapsedHeight = 200,
  moreLabel = 'Развернуть',
  lessLabel = 'Свернуть',
  className = '',
}: {
  children: React.ReactNode
  collapsedHeight?: number
  moreLabel?: string
  lessLabel?: string
  className?: string
}) {
  const { theme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  const toColor = useMemo(
    () => (theme === 'light' ? 'to-white' : 'to-slate-900'),
    [theme]
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setIsOverflowing(el.scrollHeight > collapsedHeight + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [collapsedHeight, children])

  return (
    <div className={`relative ${className}`}>
      <div
        ref={ref}
        style={{ maxHeight: expanded ? undefined : collapsedHeight }}
        className="overflow-hidden transition-[max-height] duration-300"
      >
        {children}
      </div>

      {!expanded && isOverflowing && (
        <div className={`pointer-events-none absolute left-0 right-0 bottom-10 h-16 bg-gradient-to-b from-transparent ${toColor}`} />
      )}

      {isOverflowing && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(v => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-600/50 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-slate-700/40"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? lessLabel : moreLabel}
          </button>
        </div>
      )}
    </div>
  )
}
