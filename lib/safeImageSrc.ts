// lib/safeImageSrc.ts
const PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
       <defs>
         <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
           <stop offset="0" stop-color="#e5e7eb"/>
           <stop offset="1" stop-color="#cbd5e1"/>
         </linearGradient>
       </defs>
       <rect width="300" height="400" fill="url(#g)"/>
       <g fill="#94a3b8">
         <circle cx="80" cy="120" r="35"/>
         <rect x="120" y="90" width="120" height="60" rx="8"/>
         <rect x="60" y="210" width="180" height="12" rx="6"/>
         <rect x="80" y="235" width="140" height="12" rx="6"/>
       </g>
     </svg>`
  );

/** Возвращает валидный src для next/image */
export function safeImageSrc(input: unknown, placeholder = PLACEHOLDER): string {
  if (input == null) return placeholder;
  let s = String(input).trim();
  if (!s) return placeholder;

  if (s.startsWith('data:')) return s;          // base64 ok
  if (/^https?:\/\//i.test(s)) return s;        // абсолютный URL
  if (s.startsWith('/')) return s;              // путь из /public
  if (/^[a-z0-9/_\-.]+$/i.test(s)) return '/' + s.replace(/^\/+/, ''); // относительный

  return placeholder; // всё остальное — мусор
}
