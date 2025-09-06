// components/ViewCounter.tsx
'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  slug: string;
  className?: string;
  /** если true — нарисует 👁, false — только число (под твой бейдж с Eye-иконкой) */
  showIcon?: boolean;
};

export default function ViewCounter({ slug, className, showIcon = true }: Props) {
  const [total, setTotal] = useState<number | null>(null);
  const [hit, setHit] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let t: any;
    const el = ref.current;
    if (!el) return;

    // Подгружаем текущие значения
    (async () => {
      try {
        const r = await fetch(`/api/views/${encodeURIComponent(slug)}`, { cache: 'no-store' });
        const j = await r.json();
        if (typeof j.total === 'number') setTotal(j.total);
      } catch {}
    })();

    const onVisible = (entries: IntersectionObserverEntry[]) => {
      const e = entries[0];
      if (e.isIntersecting && !hit) {
        // 1 сек. реального просмотра
        t = setTimeout(async () => {
          try {
            await fetch(`/api/views/${encodeURIComponent(slug)}`, { method: 'POST', credentials: 'include' });
            setHit(true);
            const r = await fetch(`/api/views/${encodeURIComponent(slug)}`, { cache: 'no-store' });
            const j = await r.json();
            if (typeof j.total === 'number') setTotal(j.total);
          } catch {}
        }, 1000);
      } else {
        clearTimeout(t);
      }
    };

    const io = new IntersectionObserver(onVisible, { threshold: 0.5 });
    io.observe(el);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [slug, hit]);

  const formatted = total == null ? '—' : Intl.NumberFormat('ru-RU').format(total);

  return (
    <span ref={ref} className={className}>
      {showIcon ? '👁 ' : null}{formatted}
    </span>
  );
}
