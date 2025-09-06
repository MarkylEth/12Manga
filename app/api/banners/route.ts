// app/api/banners/route.ts
import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BANNERS_DIR = path.join(process.cwd(), 'public', 'banners')
const exts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

type CfgItem = { file: string; title?: string; href?: string; subtitle?: string }

function titleFromFile(name: string) {
  const base = name.replace(/\.[^.]+$/, '')
  const pretty = base.replace(/[_-]+/g, ' ').trim()
  return pretty.charAt(0).toUpperCase() + pretty.slice(1)
}

export async function GET() {
  try {
    // необязательная настройка ссылок/заголовков через banners.json
    let cfg: CfgItem[] = []
    try {
      const json = await fs.readFile(path.join(BANNERS_DIR, 'banners.json'), 'utf8')
      cfg = JSON.parse(json)
    } catch {
      /* ignore — файла может не быть */
    }

    // читаем файлы из /public/banners
    const all = await fs.readdir(BANNERS_DIR)
    const files = all.filter(f => exts.has(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

    const items = files.map((file) => {
      const match = cfg.find(c => c.file === file)
      const coverUrl = `/banners/${encodeURIComponent(file)}`
      return {
        id: file,
        title: match?.title ?? titleFromFile(file),
        coverUrl,
        href: match?.href ?? '#',        // по умолчанию никуда не ведёт; можно задать в banners.json
        subtitle: match?.subtitle ?? undefined,
      }
    })

    return NextResponse.json(items)
  } catch (e: any) {
    console.error('[api/banners] error:', e)
    return NextResponse.json([], { status: 200 }) // не роняем главную
  }
}
