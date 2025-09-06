'use client'

import { useEffect, useMemo, useReducer, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme } from '@/lib/theme/context'
import { Header } from '@/components/Header'

/* ======================== Справочники ======================== */
const GENRES = [
  'Арт','Безумие','Боевик','Боевые искусства','Вампиры','Военное','Гарем','Гендерная интрига',
  'Героическое фэнтези','Демоны','Детектив','Дзёсэй','Драма','Игра','Исекай','История','Киберпанк',
  'Кодомо','Комедия','Космос','Магия','Махо-сёдзё','Машины','Меха','Мистика','Музыка',
  'Научная фантастика','Омегаверс','Пародия','Повседневность','Полиция','Постапокалиптика',
  'Приключения','Психология','Романтика','Самурайский боевик','Сверхъестественное',
  'Сёдзё','Сёнен','Спорт','Супер сила','Сэйнэн','Трагедия','Триллер','Ужасы',
  'Фантастика','Фэнтези','Школа','Эротика','Этти'
] as const

// fallback если из БД теги пустые
const TAGS_FALLBACK = [
  'Азартные игры','Алхимия','Амнезия / Потеря памяти','Ангелы','Антигерой','Антиутопия','Апокалипсис',
  'Армия','Артефакты','Боги','Бои на мечах','Борьба за власть','Брат и сестра','Будущее','Ведьма',
  'Вестерн','Видеоигры','Виртуальная реальность','Владыка демонов','Военные','Война',
  'Волшебники / маги','Волшебные существа','Воспоминания из другого мира','Выживание',
  'ГГ женщина','ГГ имба','ГГ мужчина','Геймеры','Гильдии','ГГ глупый','Гоблины','Горничные',
  'Гуро','Гяру','Демоны','Драконы','Дружба','Жестокий мир','Животные компаньоны',
  'Завоевание мира','Зверолюди','Злые духи','Зомби','Игровые элементы','Империи','Исторические',
  'Камера','Квесты','Космос','Кулинария','Культивирование','ЛГБТ','Легендарное оружие','Лоли',
  'Магическая академия','Магия','Мафия','Медицина','Месть','Монстро-девушки','Монстры','Мурим',
  'На проверке','Навыки / способности','Наёмники','Насилие / жестокость','Нежить','Ниндзя',
  'Обмен телами','Обратный Гарем','Огнестрельное оружие','Офисные Работники','Пародия','Пираты',
  'Подземелья','Политика','Полиция','Полностью CGI','Преступники / Криминал','Призраки / Духи',
  'Путешествие во времени','Рабы','Разумные расы','Ранги силы','Регрессия','Реинкарнация','Роботы',
  'Рыцари','Самураи','Сгенерировано ИИ','Система','Скрытые личности','Содержит нецензурную брань',
  'Спасение мира','Спортивное тело','Средневековье','Стимпанк','Супергерои','Традиционные игры',
  'ГГ умный','Учитель','Фермерство','Философия','Хикикомори','Холодное оружие','Шантаж','Эльфы',
  'Якудза','Яндере','Япония'
] as const

const TYPES  = ['Манга','Манхва','Маньхуа'] as const
const AGE    = ['0+','12+','16+','18+'] as const
const TITLE_STATUS       = ['Онгоинг','Завершён','Пауза'] as const
const TRANSLATION_STATUS = ['Продолжается','Завершён','Заброшен'] as const
const FORMAT = ['4-кома','В цвете','Веб','Печать','Сборник','Сингл'] as const
const OTHER  = ['Не переведено','Лицензировано','Можно приобрести'] as const
const MY_LISTS = ['Читаю','В планах','Любимое','Брошено','Прочитано'] as const

/* ======================== Типы ======================== */
type OneOf<T extends readonly string[]> = T[number]
type Tri = 0 | 1 | -1
type Range = { min?: number; max?: number }

type MangaItem = {
  id: string
  title: string
  author: string
  type: OneOf<typeof TYPES>
  genres?: OneOf<typeof GENRES>[] | string[]
  tags?: string[]
  year: number
  chapters: number
  rating10: number
  age: OneOf<typeof AGE>
  titleStatus: OneOf<typeof TITLE_STATUS>
  translationStatus: OneOf<typeof TRANSLATION_STATUS>
  format: OneOf<typeof FORMAT>[]
  other?: OneOf<typeof OTHER>[]
  my?: OneOf<typeof MY_LISTS>[]
  views: number
  popularity: number
  dateAdded: string
  coverClass: string
  coverUrl?: string
}

/* ======================== Фильтры/редьюсер ======================== */
type FiltersState = {
  genresTri: Map<string, Tri>
  tagsTri: Map<string, Tri>
  genreStrict: boolean
  tagStrict: boolean
  type: Set<OneOf<typeof TYPES>>
  age: Set<OneOf<typeof AGE>>
  titleStatus: Set<OneOf<typeof TITLE_STATUS>>
  translationStatus: Set<OneOf<typeof TRANSLATION_STATUS>>
  format: Set<OneOf<typeof FORMAT>>
  other: Set<OneOf<typeof OTHER>>
  my: Set<OneOf<typeof MY_LISTS>>
  year: Range
  chapters: Range
  rating10: Range
  search: string
  sort: 'pop'|'rating'|'views'|'date'|'year'|'nameAZ'|'nameZA'|'chapters'
}

type Action =
  | { type: 'cycleTri'; field: 'genresTri' | 'tagsTri'; item: string }
  | { type: 'clearTri'; field: 'genresTri' | 'tagsTri' }
  | { type: 'setStrict'; field: 'genreStrict' | 'tagStrict'; value: boolean }
  | { type: 'toggleMulti'; field: keyof Pick<FiltersState,'type'|'age'|'titleStatus'|'translationStatus'|'format'|'other'|'my'>; value: string }
  | { type: 'setRange'; field: keyof Pick<FiltersState,'year'|'chapters'|'rating10'>; range: Range }
  | { type: 'setSearch'; value: string }
  | { type: 'setSort'; value: FiltersState['sort'] }
  | { type: 'reset' }

const initialState: FiltersState = {
  genresTri: new Map(), tagsTri: new Map(), genreStrict: false, tagStrict: false,
  type: new Set(), age: new Set(), titleStatus: new Set(), translationStatus: new Set(),
  format: new Set(), other: new Set(), my: new Set(),
  year: {}, chapters: {}, rating10: {},
  search: '', sort: 'pop'
}

function reducer(state: FiltersState, action: Action): FiltersState {
  switch (action.type) {
    case 'cycleTri': {
      const m = new Map(state[action.field])
      const prev = m.get(action.item) ?? 0
      const next: Tri = prev === 0 ? 1 : prev === 1 ? -1 : 0
      if (next === 0) m.delete(action.item); else m.set(action.item, next)
      return { ...state, [action.field]: m }
    }
    case 'clearTri': {
      const m = new Map(state[action.field]); m.clear()
      return { ...state, [action.field]: m }
    }
    case 'setStrict':     return { ...state, [action.field]: action.value }
    case 'toggleMulti': {
      const s = new Set(state[action.field] as Set<string>)
      if (s.has(action.value)) s.delete(action.value); else s.add(action.value)
      return { ...state, [action.field]: s } as FiltersState
    }
    case 'setRange':      return { ...state, [action.field]: { ...state[action.field], ...action.range } }
    case 'setSearch':     return { ...state, search: action.value }
    case 'setSort':       return { ...state, sort: action.value }
    case 'reset':         return initialState
    default:              return state
  }
}

function inRange(val: number, r: Range) {
  if (r.min !== undefined && val < r.min) return false
  if (r.max !== undefined && val > r.max) return false
  return true
}

function triToSets(tri: Map<string, Tri>) {
  const include = new Set<string>()
  const exclude = new Set<string>()
  tri.forEach((v,k) => { if (v===1) include.add(k); if (v===-1) exclude.add(k) })
  return { include, exclude }
}

function matchTri(tri: Map<string, Tri>, values: string[] | undefined, strict: boolean) {
  const vals = values ?? []
  const { include, exclude } = triToSets(tri)
  for (const ex of exclude) if (vals.includes(ex)) return false
  if (include.size === 0) return true
  if (strict) { for (const inc of include) if (!vals.includes(inc)) return false; return true }
  return vals.some(v => include.has(v))
}

/* ======================== Helpers ======================== */
function getAny(obj: any, ...paths: string[]) {
  for (const p of paths) {
    const parts = p.split('.')
    let v = obj
    for (const part of parts) v = v?.[part]
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
  }
  return undefined
}

/** Универсальный резолвер: http(s) URL, "bucket:path", "bucket/path", объекты с {url|href|path,bucket} */
function resolveCoverUrl(input: any): string | undefined {
  if (!input) return undefined
  if (typeof input === 'string') {
    const s = input.trim()
    if (!s) return undefined
    if (/^https?:\/\//i.test(s)) return s
    const byColon = s.split(':')
    const bySlash = s.split('/')
    let bucket: string | undefined
    let path: string | undefined
    if (byColon.length === 2) { bucket = byColon[0]; path = byColon[1] }
    else if (bySlash && bySlash[1]) { bucket = bySlash[0]; path = bySlash.slice(1).join('/') }
    if (bucket && path) {
      const base = (process?.env?.NEXT_PUBLIC_WASABI_PUBLIC_BASE_URL || '').replace(/\/$/, '')
      if (base) return `${base}/${bucket}/${path}`
      return `https://${bucket}.s3.wasabisys.com/${path}`
    }
    return undefined
  }
  if (typeof input === 'object') {
    if (typeof (input as any).url === 'string') return resolveCoverUrl((input as any).url)
    if (typeof (input as any).href === 'string') return resolveCoverUrl((input as any).href)
    if (typeof (input as any).path === 'string') {
      const bucket = (input as any).bucket || (input as any).bucketName
      if (bucket) {
        const base = (process?.env?.NEXT_PUBLIC_WASABI_PUBLIC_BASE_URL || '').replace(/\/$/, '')
        const p = String((input as any).path)
        if (base) return `${base}/${bucket}/${p}`
        return `https://${bucket}.s3.wasabisys.com/${p}`
      }
      return resolveCoverUrl((input as any).path)
    }
  }
  return undefined
}

function fallbackGradient(seed: string) {
  const gradients = [
    'from-blue-500 to-blue-600',
    'from-orange-500 to-red-500',
    'from-purple-500 to-purple-600',
    'from-teal-500 to-cyan-500',
    'from-slate-600 to-slate-700',
    'from-red-500 to-pink-500'
  ]
  let h = 0
  for (let i=0; i<seed.length; i++) h = (h*31 + seed.charCodeAt(i)) >>> 0
  return gradients[h % gradients.length]
}

function formatList(list?: string[] | null, max = 3) {
  const arr = (list ?? []).map(String).filter(Boolean)
  if (!arr.length) return '—'
  const first = arr.slice(0, max).join(', ')
  const rest = arr.length - max
  return rest > 0 ? `${first} +${rest}` : first
}

/* ======================== Нормализация ======================== */
function asStrArray(x: any): string[] | undefined {
  if (x == null) return undefined
  if (Array.isArray(x)) return x.map(String)
  if (typeof x === 'string') {
    try {
      const mayJson = JSON.parse(x)
      if (Array.isArray(mayJson)) return mayJson.map(String)
    } catch {}
    return x.split(',').map(s => s.trim()).filter(Boolean)
  }
  return [String(x)]
}
function mapTitleStatus(v: any): MangaItem['titleStatus'] {
  const s = String(v ?? '').toLowerCase()
  if (['ongoing','онгоинг','выпускается','продолжается'].includes(s)) return 'Онгоинг'
  if (['completed','завершен','завершён','завершено','end'].includes(s)) return 'Завершён'
  if (['paused','пауза','hiatus'].includes(s)) return 'Пауза'
  return 'Онгоинг'
}
function mapTranslationStatus(v: any): MangaItem['translationStatus'] {
  const s = String(v ?? '').toLowerCase()
  if (['ongoing','продолжается'].includes(s)) return 'Продолжается'
  if (['completed','завершен','завершён','завершено'].includes(s)) return 'Завершён'
  if (['dropped','abandoned','заброшен','заброшено'].includes(s)) return 'Заброшен'
  return 'Продолжается'
}
function mapType(v: any): MangaItem['type'] {
  const s = String(v ?? '').toLowerCase()
  if (['манхва','manhwa'].includes(s)) return 'Манхва'
  if (['маньхуа','manhua'].includes(s)) return 'Маньхуа'
  return 'Манга'
}
function mapAge(v: any): MangaItem['age'] {
  const s = String(v ?? '').replace(/\s/g,'')
  if (['0+','0'].includes(s)) return '0+'
  if (['12+','12'].includes(s)) return '12+'
  if (['16+','16'].includes(s)) return '16+'
  if (['18+','18'].includes(s)) return '18+'
  return '12+'
}

function normalizeRow(row: any): MangaItem {
  const releaseYear = Number(
    getAny(row, 'release_year', 'year', 'manga.release_year', 'manga.year')
  )

  const year = Number.isFinite(releaseYear) && releaseYear > 0
    ? releaseYear
    : (getAny(row, 'release_date', 'manga.release_date')
        ? new Date(getAny(row, 'release_date', 'manga.release_date')).getFullYear()
        : new Date(getAny(row, 'date_added','created_at','manga.date_added','manga.created_at') ?? Date.now()).getFullYear())

  const rating10 =
    typeof row.rating10 === 'number' ? row.rating10 :
    typeof row.rating === 'number'   ? Math.max(0, Math.min(10, row.rating * (row.rating <= 5 ? 2 : 1))) :
    0

  // ключевой фикс: читаем возраст из любых мест, включая вложенный "manga"
  const ageRaw = getAny(
    row,
    'age',
    'age_rating',
    'ageRating',
    'manga.age',
    'manga.age_rating',
    'manga.ageRating'
  )

  const coverUrl = resolveCoverUrl(getAny(
    row,
    'cover_url','cover','image','poster','thumbnail',
    'manga.cover_url','manga.cover','manga.image','manga.poster','manga.thumbnail'
  ))

  return {
    id: String(getAny(row, 'id', 'manga.id')),
    title: String(getAny(row, 'title', 'manga.title') ?? 'Без названия'),
    author: String(getAny(row, 'author','artist','manga.author','manga.artist') ?? 'Неизвестный автор'),
    type: mapType(getAny(row, 'type','kind','manga.type','manga.kind')),
    genres: asStrArray(getAny(row, 'genres','manga.genres')) as any,
    tags: asStrArray(getAny(row, 'tags','manga.tags')) as any,
    year,
    chapters: Number(getAny(row, 'chapters','chapters_count','manga.chapters','manga.chapters_count') ?? 0),
    rating10,
    age: mapAge(ageRaw),
    titleStatus: mapTitleStatus(getAny(row, 'title_status','status','manga.title_status','manga.status')),
    translationStatus: mapTranslationStatus(getAny(row, 'translation_status','manga.translation_status')),
    format: (asStrArray(getAny(row, 'format','manga.format')) ?? ['Веб']) as any,
    other: asStrArray(getAny(row, 'other','manga.other')) as any,
    my: asStrArray(getAny(row, 'my','manga.my')) as any,
    views: Number(getAny(row, 'views','view_count','manga.views','manga.view_count') ?? 0),
    popularity: Number(getAny(row, 'popularity','views','view_count','manga.popularity','manga.views','manga.view_count') ?? 0),
    dateAdded: String(getAny(row, 'date_added','created_at','manga.date_added','manga.created_at') ?? new Date().toISOString()),
    coverClass: String(getAny(row, 'cover_class','manga.cover_class') ?? fallbackGradient(String(getAny(row, 'id','manga.id') ?? '0'))),
    coverUrl
  }
}

/* ======================== Страница ======================== */
export default function CatalogPage() {
  const { theme } = useTheme()
  const mode: 'light' | 'dark' = theme === 'light' ? 'light' : 'dark'
  const textClass = mode === 'light' ? 'text-gray-900' : 'text-white'

  const [filters, dispatch] = useReducer(reducer, initialState)
  const [items, setItems] = useState<MangaItem[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const PAGE_SIZE = 24
  const [page, setPage] = useState(1)

  useEffect(() => {
  let cancelled = false
  ;(async () => {
    try {
      setLoading(true); setError(null)

      const res = await fetch('/api/catalog?limit=200', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const json = await res.json()

      // ✅ Явно учитываем форму ответа нашего API на NEON
      if (json && typeof json === 'object' && 'ok' in json && json.ok === false) {
        throw new Error(json.message || 'API error')
      }

      // ✅ Надёжно выбираем массив строк при разных формах
      const rows: any[] =
        Array.isArray(json?.data) ? json.data :
        Array.isArray(json)       ? json :
        Array.isArray(json?.rows) ? json.rows : []

      if (cancelled) return

      const normalized = rows.map(normalizeRow)

      // словарь тегов
      const tagSet = new Set<string>()
      for (const it of normalized) for (const t of (it.tags ?? [])) tagSet.add(t)
      const tagList = Array.from(tagSet).sort((a,b)=>a.localeCompare(b,'ru'))

      setAllTags(tagList.length ? tagList : Array.from(TAGS_FALLBACK))
      setItems(normalized)
    } catch (e:any) {
      if (cancelled) return
      // ❗ теперь видна причина вместо «пусто»
      setError(e?.message ?? 'Load error')
      setItems([])
      setAllTags(Array.from(TAGS_FALLBACK))
    } finally {
      if (!cancelled) setLoading(false)
    }
  })()
  return () => { cancelled = true }
}, [])

  const data = useMemo(() => {
    const arr = items.filter(it => {
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!(`${it.title} ${it.author}`.toLowerCase().includes(q))) return false
      }
      if (!matchTri(filters.genresTri, it.genres as string[] | undefined, filters.genreStrict)) return false
      if (!matchTri(filters.tagsTri, it.tags, filters.tagStrict)) return false
      if (filters.type.size && !filters.type.has(it.type)) return false
      if (filters.age.size && !filters.age.has(it.age)) return false
      if (filters.titleStatus.size && !filters.titleStatus.has(it.titleStatus)) return false
      if (filters.translationStatus.size && !filters.translationStatus.has(it.translationStatus)) return false
      if (filters.format.size && !it.format.some(f => filters.format.has(f))) return false
      if (filters.other.size && !it.other?.some(o => filters.other.has(o))) return false
      if (filters.my.size && !it.my?.some(o => filters.my.has(o))) return false
      if (!inRange(it.year, filters.year)) return false
      if (!inRange(it.chapters, filters.chapters)) return false
      if (!inRange(it.rating10, filters.rating10)) return false
      return true
    })

    switch (filters.sort) {
      case 'rating':   arr.sort((a,b)=>b.rating10-a.rating10); break
      case 'views' :   arr.sort((a,b)=>b.views-a.views); break
      case 'date'  :   arr.sort((a,b)=>+new Date(b.dateAdded)-+new Date(a.dateAdded)); break
      case 'year'  :   arr.sort((a,b)=>b.year-a.year); break
      case 'chapters': arr.sort((a,b)=>b.chapters-a.chapters); break
      case 'nameAZ':   arr.sort((a,b)=>a.title.localeCompare(b.title)); break
      case 'nameZA':   arr.sort((a,b)=>b.title.localeCompare(a.title)); break
      default      :   arr.sort((a,b)=>b.popularity-a.popularity)
    }
    return arr
  }, [items, filters])

  useEffect(() => { setPage(1) }, [data])

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE))
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [totalPages, page])

  const start = (page - 1) * PAGE_SIZE
  const pageData = data.slice(start, start + PAGE_SIZE)

  return (
    <div className={`min-h-screen ${mode==='light'?'bg-gray-50':'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950'}`}>
      <div className="max-w-9xl mx-auto">
        <Header showSearch={false} />
      </div>

      <div className="flex max-w-7xl mx-auto gap-8 p-6">
        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0">
          <div className={`${mode==='light'?'bg-white':'bg-slate-800/50'} rounded-xl p-4 mb-4 border ${mode==='light'?'border-gray-200':'border-slate-700'}`}>
            <input
              value={filters.search}
              onChange={(e)=>dispatch({type:'setSearch', value:e.target.value})}
              placeholder="Поиск по названию/автору…"
              className={`w-full rounded-lg border px-3 py-2 text-sm ${mode==='light'
                ? 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                : 'bg-slate-900/60 border-slate-700 text-slate-200 placeholder-slate-500'}`}
            />
            <div className="mt-3">
              <label className={`block text-xs mb-1 ${mode==='light'?'text-gray-500':'text-slate-400'}`}>Сортировка</label>
              <select
                value={filters.sort}
                onChange={(e)=>dispatch({type:'setSort', value:e.target.value as FiltersState['sort']})}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${mode==='light'
                  ? 'bg-white border-gray-300 text-gray-800'
                  : 'bg-slate-900/60 border-slate-700 text-slate-200'}`}
              >
                <option value="pop">По популярности</option>
                <option value="rating">По рейтингу</option>
                <option value="views">По просмотрам</option>
                <option value="date">По дате добавления</option>
                <option value="year">По году</option>
                <option value="chapters">По количеству глав</option>
                <option value="nameAZ">По названию (А-Я)</option>
                <option value="nameZA">По названию (Я-А)</option>
              </select>
            </div>
          </div>

          <Section title="Жанры" theme={mode} defaultOpen={false} onReset={()=>dispatch({type:'clearTri', field:'genresTri'})}>
            {({close})=>(
              <>
                <TriList
                  items={GENRES}
                  tri={filters.genresTri}
                  onCycle={(item)=>dispatch({type:'cycleTri', field:'genresTri', item})}
                  theme={mode}
                  strict={filters.genreStrict}
                  onToggleStrict={(v)=>dispatch({type:'setStrict', field:'genreStrict', value:v})}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={()=>dispatch({type:'clearTri', field:'genresTri'})}
                    className={`px-3 py-2 text-sm rounded-lg border
                      ${mode==='light'
                        ? 'border-gray-300 text-gray-700 hover:bg-gray-100'
                        : 'border-slate-600/40 text-slate-200 hover:bg-slate-600/10'}`}
                  >
                    Сбросить
                  </button>
                  <button onClick={close} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">Выбрать</button>
                </div>
              </>
            )}
          </Section>

          <Section title="Теги" theme={mode} defaultOpen={false} onReset={()=>dispatch({type:'clearTri', field:'tagsTri'})}>
            {({close})=>(
              <>
                <TriList
                  items={allTags.length ? allTags : Array.from(TAGS_FALLBACK)}
                  tri={filters.tagsTri}
                  onCycle={(item)=>dispatch({type:'cycleTri', field:'tagsTri', item})}
                  theme={mode}
                  strict={filters.tagStrict}
                  onToggleStrict={(v)=>dispatch({type:'setStrict', field:'tagStrict', value:v})}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={()=>dispatch({type:'clearTri', field:'tagsTri'})}
                    className={`px-3 py-2 text-sm rounded-lg border
                      ${mode==='light'
                        ? 'border-gray-300 text-gray-700 hover:bg-gray-100'
                        : 'border-slate-600/40 text-slate-200 hover:bg-slate-600/10'}`}
                  >
                    Сбросить
                  </button>
                  <button onClick={close} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">Выбрать</button>
                </div>
              </>
            )}
          </Section>

          <Section title="Количество глав" theme={mode} defaultOpen>
            {() => (
              <RangeInputs
                value={filters.chapters}
                onChange={(r)=>dispatch({type:'setRange', field:'chapters', range:r})}
                placeholderMin="от, напр. 10"
                placeholderMax="до, напр. 200"
                theme={mode}
              />
            )}
          </Section>

          <Section title="Год релиза" theme={mode} defaultOpen>
            {() => (
              <RangeInputs
                value={filters.year}
                onChange={(r)=>dispatch({type:'setRange', field:'year', range:r})}
                placeholderMin="от, напр. 2010"
                placeholderMax="до, напр. 2025"
                theme={mode}
              />
            )}
          </Section>

          <Section title="Оценка (0–10)" theme={mode} defaultOpen>
            {() => (
              <RangeInputs
                value={filters.rating10}
                onChange={(r)=>dispatch({type:'setRange', field:'rating10', range:r})}
                placeholderMin="минимум"
                placeholderMax="максимум"
                theme={mode}
              />
            )}
          </Section>

          <Section title="Тип" theme={mode} defaultOpen>
            {() => (
              <MultiCheck
                items={TYPES}
                selected={filters.type as Set<any>}
                onToggle={(v)=>dispatch({type:'toggleMulti', field:'type', value:v})}
                theme={mode}
                columns={1}
              />
            )}
          </Section>

          <Section title="Возрастной рейтинг" theme={mode} defaultOpen>
            {() => (
              <MultiCheck
                items={AGE}
                selected={filters.age as Set<any>}
                onToggle={(v)=>dispatch({type:'toggleMulti', field:'age', value:v})}
                theme={mode}
                columns={4}
              />
            )}
          </Section>

          <Section title="Статус тайтла" theme={mode} defaultOpen>
            {() => (
              <MultiCheck
                items={TITLE_STATUS}
                selected={filters.titleStatus as Set<any>}
                onToggle={(v)=>dispatch({type:'toggleMulti', field:'titleStatus', value:v})}
                theme={mode}
                columns={1}
              />
            )}
          </Section>

          <Section title="Статус перевода" theme={mode} defaultOpen>
            {() => (
              <MultiCheck
                items={TRANSLATION_STATUS}
                selected={filters.translationStatus as Set<any>}
                onToggle={(v)=>dispatch({type:'toggleMulti', field:'translationStatus', value:v})}
                theme={mode}
                columns={1}
              />
            )}
          </Section>

          <Section title="Формат выпуска" theme={mode} defaultOpen>
            {() => (
              <MultiCheck
                items={FORMAT}
                selected={filters.format as Set<any>}
                onToggle={(v)=>dispatch({type:'toggleMulti', field:'format', value:v})}
                theme={mode}
                columns={3}
              />
            )}
          </Section>

          <Section title="Другое" theme={mode} defaultOpen>
            {() => (
              <MultiCheck
                items={OTHER}
                selected={filters.other as Set<any>}
                onToggle={(v)=>dispatch({type:'toggleMulti', field:'other', value:v})}
                theme={mode}
                columns={1}
              />
            )}
          </Section>

          <Section title="Мои списки" theme={mode} defaultOpen>
            {() => (
              <MultiCheck
                items={MY_LISTS}
                selected={filters.my as Set<any>}
                onToggle={(v)=>dispatch({type:'toggleMulti', field:'my', value:v})}
                theme={mode}
                columns={2}
              />
            )}
          </Section>

          <button
            onClick={()=>dispatch({type:'reset'})}
            className="w-full mt-2 rounded-lg border border-transparent bg-slate-600 text-white py-2.5 text-sm hover:opacity-90"
          >
            Сбросить всё
          </button>
        </aside>

        {/* Main */}
        <main className="flex-1">
          <div className="flex justify-between items-center mb-6">
            <h1 className={`text-3xl font-bold ${textClass}`}>Каталог</h1>
          </div>

          {loading && <div className={`${mode==='light'?'text-gray-600':'text-slate-400'}`}>Загрузка…</div>}
          {error && <div className="text-red-500">Ошибка загрузки: {error}</div>}

          {!loading && !error && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                {pageData.map((manga) => (
                  <article
                    key={manga.id}
                    className={`${mode==='light'?'bg-white':'bg-slate-800/50'}
                      rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]
                      border ${mode==='light'?'border-gray-200':'border-slate-700'}
                      flex flex-col h-[520px] xl:h-[560px]`}
                  >
                    <Link href={`/manga/${manga.id}`} className="block">
                      <div className="relative w-full bg-black/10 rounded-2xl overflow-hidden" style={{ aspectRatio: '2 / 3' }}>
                        {manga.coverUrl ? (
                          <Image
                            src={manga.coverUrl}
                            alt={manga.title}
                            fill
                            className="object-cover"
                            sizes="(min-width: 1536px) 300px, (min-width: 1280px) 260px, (min-width: 1024px) 25vw, 50vw"
                            priority={false}
                            quality={85}
                            unoptimized
                          />
                        ) : (
                          <div className={`absolute inset-0 bg-gradient-to-br ${manga.coverClass}`} />
                        )}

                        {/* статус слева сверху */}
                        <div className="absolute top-2 left-2">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium shadow-sm ${
                              manga.titleStatus === 'Онгоинг'
                                ? 'bg-green-500 text-white'
                                : manga.titleStatus === 'Завершён'
                                ? 'bg-blue-500 text-white'
                                : 'bg-orange-500 text-white'
                            }`}
                          >
                            {manga.titleStatus}
                          </span>
                        </div>

                        {/* возраст справа сверху */}
                        <AgeBadge age={manga.age} mode={mode} />

                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                      </div>
                    </Link>

                    <div className="p-4 flex flex-col h-full">
                      <Link href={`/manga/${manga.id}`} className="hover:underline">
                        <h3 className={`font-semibold text-lg mb-1 ${textClass} line-clamp-2 leading-snug`}>{manga.title}</h3>
                      </Link>

                      <p className={`${mode==='light'?'text-gray-600':'text-slate-400'} text-sm mb-3`}>{manga.author}</p>

                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span
                          className={`text-xs px-2 py-[2px] rounded-full border
                            ${mode==='light'
                              ? 'bg-slate-500/10 border-slate-300 text-gray-700'
                              : 'bg-slate-700/30 border-slate-600/60 text-slate-200'}`}
                        >
                          {manga.translationStatus}
                        </span>
                        <span
                          className={`text-xs px-2 py-[2px] rounded-full border
                            ${mode==='light'
                              ? 'bg-slate-500/10 border-slate-300 text-gray-700'
                              : 'bg-slate-700/30 border-slate-600/60 text-slate-200'}`}
                        >
                          {manga.year}
                        </span>
                      </div>

                      <div className={`text-xs ${mode==='light'?'text-gray-700':'text-slate-200'} space-y-1 mb-3`}>
                        <div className="line-clamp-1">
                          <span className={`${mode==='light'?'text-gray-500':'text-slate-400'}`}>Жанры: </span>
                          {formatList(manga.genres as string[], 3)}
                        </div>
                        <div className="line-clamp-1">
                          <span className={`${mode==='light'?'text-gray-500':'text-slate-400'}`}>Теги: </span>
                          {formatList(manga.tags, 3)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-auto pt-2">
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => {
                            const filled = i < Math.round(manga.rating10/2)
                            return <span key={i} className={`text-sm ${filled ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
                          })}
                          <span className={`${mode==='light'?'text-gray-600':'text-slate-400'} text-xs ml-1`}>{manga.rating10.toFixed(1)}</span>
                        </div>
                        <Link
                          href={`/manga/${manga.id}`}
                          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Читать
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {data.length > 0 && (
                <CatalogPagination
                  page={page}
                  totalPages={totalPages}
                  onChange={(p) => setPage(p)}
                  theme={mode}
                  totalItems={data.length}
                  pageSize={PAGE_SIZE}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

/* ======================== UI-компоненты ======================== */
function Section({
  title, theme, defaultOpen = false, onReset, children
}: {
  title: string
  theme: 'light' | 'dark'
  defaultOpen?: boolean
  onReset?: () => void
  children: (controls: { close: () => void }) => React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`${theme==='light'?'bg-white':'bg-slate-800/50'} rounded-xl border ${theme==='light'?'border-gray-200':'border-slate-700'} mb-4`}>
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={()=>setOpen(o=>!o)} className="font-semibold">
          <span className={theme==='light'?'text-gray-900':'text-white'}>{open ? '▾ ' : '▸ '}{title}</span>
        </button>
        {onReset && (
          <button
            onClick={onReset}
            className={`text-xs rounded-md px-2 py-1
              ${theme==='light'
                ? 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/40'}`}
          >
            сбросить
          </button>
        )}
      </div>
      {open && <div className="px-4 pb-4">{children({ close: () => setOpen(false) })}</div>}
    </div>
  )
}

function TriList({
  items, tri, onCycle, theme, strict, onToggleStrict
}: {
  items: readonly string[]
  tri: Map<string, Tri>
  onCycle: (item: string) => void
  theme: 'light'|'dark'
  strict: boolean
  onToggleStrict: (v:boolean)=>void
}) {
  const [q, setQ] = useState('')
  const filtered = items.filter(i => i.toLowerCase().includes(q.toLowerCase()))
  const box = (v?: Tri) =>
    `size-4 rounded-sm border flex items-center justify-center text-[10px] leading-none
     ${v===1 ? 'border-emerald-500 bg-emerald-500/40' :
       v===-1 ? 'border-rose-500 bg-rose-500/40' :
       theme==='light' ? 'border-gray-300 bg-white' : 'border-slate-600 bg-slate-900/60'}`
  const labelColor = theme==='light'?'text-gray-700':'text-slate-300'
  const holder = theme==='light'
    ? 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
    : 'bg-slate-900/60 border-slate-700 text-slate-200 placeholder-slate-500'

  return (
    <>
      <input
        value={q}
        onChange={(e)=>setQ(e.target.value)}
        placeholder="Фильтр по списку…"
        className={`w-full rounded-lg border px-3 py-2 text-sm mb-3 ${holder}`}
      />

      <label className="flex items-center gap-2 mb-3 select-none">
        <input type="checkbox" className="accent-blue-600" checked={strict} onChange={(e)=>onToggleStrict(e.target.checked)} />
        <span className={labelColor}>Строгое совпадение</span>
        <span className={`ml-auto text-[11px] ${theme==='light' ? 'text-gray-500' : 'text-slate-400'}`}>
          Пусто → ✓ включить → ✕ исключить
        </span>
      </label>

      <div className="max-h-72 overflow-auto pr-1 space-y-1">
        {filtered.map((name)=> {
          const state = tri.get(name) ?? 0
          return (
            <button key={name} onClick={()=>onCycle(name)} className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-500/10 transition text-left">
              <span className={box(state)}>{state===1?'✓':state===-1?'✕':''}</span>
              <span className={`${labelColor} flex-1`}>{name}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function MultiCheck<T extends string>({
  items, selected, onToggle, theme, columns = 3
}: {
  items: readonly T[]
  selected: Set<T>
  onToggle: (val: T) => void
  theme: 'light'|'dark'
  columns?: 1|2|3|4
}) {
  const labelColor = theme==='light' ? 'text-gray-700' : 'text-slate-300'
  const boxOff   = theme==='light' ? 'border-gray-300 bg-white' : 'border-slate-600 bg-slate-900/60'

  const colsClass = columns===1 ? 'grid-cols-1'
                  : columns===2 ? 'grid-cols-2'
                  : columns === 3 ? 'grid-cols-3'
                  : 'grid-cols-4'

  return (
    <div className={`grid ${colsClass} gap-2`}>
      {items.map((it)=> {
        const checked = selected.has(it)
        return (
          <label key={it} className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={checked} onChange={() => onToggle(it)} className="sr-only" />
            <span
              className={`size-4 rounded-sm border flex items-center justify-center text-[10px] leading-none
                ${checked ? 'border-blue-600 bg-blue-600 text-white' : boxOff}`}
            >
              {checked ? '✓' : ''}
            </span>
            <span className={labelColor}>{it}</span>
          </label>
        )
      })}
    </div>
  )
}

function RangeInputs({
  value, onChange, placeholderMin, placeholderMax, theme
}: {
  value: Range
  onChange: (r: Range) => void
  placeholderMin?: string
  placeholderMax?: string
  theme: 'light' | 'dark'
}) {
  const cls = theme==='light'
    ? 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
    : 'bg-slate-900/60 border-slate-700 text-slate-200 placeholder-slate-500'

  const [minText, setMinText] = useState(value.min != null ? String(value.min) : '')
  const [maxText, setMaxText] = useState(value.max != null ? String(value.max) : '')

  useEffect(() => { setMinText(value.min != null ? String(value.min) : '') }, [value.min])
  useEffect(() => { setMaxText(value.max != null ? String(value.max) : '') }, [value.max])

  const re = /^\d*([.]\d*)?$/

  const handleMin = (t: string) => {
    const s = t.replace(',', '.')
    if (!re.test(s)) return setMinText(s)
    setMinText(s)
    if (s === '' || s === '.') return onChange({ min: undefined })
    const n = Number(s)
    if (!Number.isNaN(n)) onChange({ min: n })
  }

  const handleMax = (t: string) => {
    const s = t.replace(',', '.')
    if (!re.test(s)) return setMaxText(s)
    setMaxText(s)
    if (s === '' || s === '.') return onChange({ max: undefined })
    const n = Number(s)
    if (!Number.isNaN(n)) onChange({ max: n })
  }

  return (
    <div className="flex items-center gap-3">
      <input
        inputMode="decimal"
        step="any"
        pattern="[0-9]*[.,]?[0-9]*"
        className={`w-full rounded-lg border px-3 py-2 text-sm ${cls}`}
        placeholder={placeholderMin ?? 'от'}
        value={minText}
        onChange={(e)=>handleMin(e.target.value)}
      />
      <span className={theme==='light'?'text-gray-500':'text-slate-400'}>—</span>
      <input
        inputMode="decimal"
        step="any"
        pattern="[0-9]*[.,]?[0-9]*"
        className={`w-full rounded-lg border px-3 py-2 text-sm ${cls}`}
        placeholder={placeholderMax ?? 'до'}
        value={maxText}
        onChange={(e)=>handleMax(e.target.value)}
      />
    </div>
  )
}

/* ====== возрастной бейдж ====== */
function AgeBadge({ age, mode }: { age: OneOf<typeof AGE>, mode: 'light'|'dark' }) {
  const palette =
    age === '0+'  ? (mode==='light' ? 'bg-emerald-500 text-white' : 'bg-emerald-400 text-black') :
    age === '12+' ? (mode==='light' ? 'bg-sky-500 text-white'     : 'bg-sky-400 text-black')     :
    age === '16+' ? (mode==='light' ? 'bg-amber-500 text-white'   : 'bg-amber-400 text-black')   :
                    (mode==='light' ? 'bg-rose-600 text-white'     : 'bg-rose-500 text-white')
  return (
    <div className="absolute top-2 right-2">
      <span className={`px-2 py-1 rounded-full text-xs font-semibold shadow-sm ${palette}`}>{age}</span>
    </div>
  )
}

/* ====== Пагинация ====== */
function CatalogPagination({
  page,
  totalPages,
  onChange,
  theme,
  totalItems,
  pageSize
}: {
  page: number
  totalPages: number
  onChange: (p: number) => void
  theme: 'light' | 'dark'
  totalItems: number
  pageSize: number
}) {
  const btnBase = `px-3 h-9 rounded-lg border text-sm transition`
  const on = theme === 'light'
    ? 'bg-blue-600 border-blue-600 text-white'
    : 'bg-blue-600/90 border-blue-600 text-white'
  const off = theme === 'light'
    ? 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50'
    : 'bg-slate-900/60 border-slate-700 text-slate-200 hover:bg-slate-800/60'
  const disabled = theme === 'light'
    ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
    : 'bg-slate-800/40 border-slate-700/60 text-slate-500 cursor-not-allowed'

  const makePageItems = (p: number, t: number): (number | 'dots')[] => {
    if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1)
    if (p <= 3) return [1, 2, 3, 'dots', t]
    if (p >= t - 2) return [1, 'dots', t - 2, t - 1, t]
    return [1, 'dots', p - 1, p, p + 1, 'dots', t]
  }

  const items = makePageItems(page, totalPages)

  const toFirst = () => onChange(1)
  const toPrev = () => onChange(Math.max(1, page - 1))
  const toNext = () => onChange(Math.min(totalPages, page + 1))
  const toLast = () => onChange(totalPages)

  const infoText = (() => {
    const from = (page - 1) * pageSize + 1
    const to = Math.min(page * pageSize, totalItems)
    return `${from}–${to} из ${totalItems}`
  })()

  return (
    <div className="mt-6 mb-2 flex flex-col items-center gap-3">
      <div className={theme==='light' ? 'text-gray-600' : 'text-slate-400 text-sm'}>
        {infoText} • Стр. {page} / {totalPages}
      </div>

      <div className="flex items-center gap-2">
        <button
          className={`${btnBase} ${page === 1 ? disabled : off}`}
          onClick={toFirst}
          disabled={page === 1}
          aria-label="В начало"
          title="В начало"
        >
          «
        </button>
        <button
          className={`${btnBase} ${page === 1 ? disabled : off}`}
          onClick={toPrev}
          disabled={page === 1}
          aria-label="Назад"
          title="Назад"
        >
          ‹
        </button>

        {items.map((it, idx) =>
          it === 'dots' ? (
            <span key={`dots-${idx}`} className={theme==='light' ? 'px-2 text-gray-500' : 'px-2 text-slate-400'}>
              …
            </span>
          ) : (
            <button
              key={String(it)}
              className={`${btnBase} ${page === it ? on : off}`}
              onClick={() => onChange(Number(it))}
              aria-current={page === it ? 'page' : undefined}
            >
              {it}
            </button>
          )
        )}

        <button
          className={`${btnBase} ${page === totalPages ? disabled : off}`}
          onClick={toNext}
          disabled={page === totalPages}
          aria-label="Вперёд"
          title="Вперёд"
        >
          ›
        </button>
        <button
          className={`${btnBase} ${page === totalPages ? disabled : off}`}
          onClick={toLast}
          disabled={page === totalPages}
          aria-label="В конец"
          title="В конец"
        >
          »
        </button>
      </div>
    </div>
  )
}
