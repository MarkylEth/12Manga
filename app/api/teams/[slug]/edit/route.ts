// app/api/teams/[slug]/edit/route.ts - ИСПРАВЛЕННАЯ ВЕРСИЯ
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getViewerId } from '@/lib/auth/route-guards'
import { isTeamEditor, resolveTeamBySlug } from '../_utils'

type Params = { params: { slug: string } }

// Упрощенная валидация URL для использования в edit/route.ts
// Заменена функция isHttpUrl на эту версию:
const isHttpUrl = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  if (!s) return null

  // Простая проверка на базовые паттерны
  if (s.includes('..') || s.includes(' ')) return null

  // Автоматически добавляем https:// если нет протокола
  let url = s
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }

  // Простая проверка структуры URL
  const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/i
  if (!urlPattern.test(url)) return null

  return url
}

const toStringOrNull = (v: unknown) => {
  const s = (v ?? '').toString().trim()
  return s.length ? s : null
}

const toBool = (v: unknown) => (typeof v === 'boolean' ? v : String(v ?? '').toLowerCase() === 'true')

const toTextArray = (v: unknown, { maxLen = 64, maxItems = 64 } = {}) => {
  const arr = Array.isArray(v) ? v : []
  const out: string[] = []
  for (const x of arr) {
    const s = String(x ?? '').trim()
    if (!s) continue
    out.push(s.slice(0, maxLen))
    if (out.length >= maxItems) break
  }
  return out
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const team = await resolveTeamBySlug(params.slug)
    if (!team) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const uid = await getViewerId(req)
    if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const can = await isTeamEditor(team.id, uid)
    if (!can) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({} as any))

    // Собираем поля для обновления
    const updateFields: string[] = []
    const updateValues: any[] = []
    let paramIndex = 1

    // Обязательное поле - название
    const name = toStringOrNull(body.name)
    if (name) {
      updateFields.push(`name = $${paramIndex}`)
      updateValues.push(name)
      paramIndex++
    }

    // bio может быть null для очистки
    if ('bio' in body) {
      const bio = toStringOrNull(body.bio)
      updateFields.push(`bio = $${paramIndex}`)
      updateValues.push(bio)
      paramIndex++
    }

    // hiring_text может быть null для очистки
    if ('hiring_text' in body) {
      const hiring_text = toStringOrNull(body.hiring_text)
      updateFields.push(`hiring_text = $${paramIndex}`)
      updateValues.push(hiring_text)
      paramIndex++
    }

    // Даты
    if ('started_at' in body) {
      const started_at_raw = toStringOrNull(body.started_at)
      if (started_at_raw) {
        // Проверяем формат YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(started_at_raw)) {
          return NextResponse.json({ error: 'bad_started_at', message: 'Date must be in YYYY-MM-DD format' }, { status: 400 })
        }
        updateFields.push(`started_at = $${paramIndex}::date`)
        updateValues.push(started_at_raw)
        paramIndex++
      } else if (body.started_at === null) {
        updateFields.push(`started_at = $${paramIndex}`)
        updateValues.push(null)
        paramIndex++
      }
    }

    // Булевы поля
    if (typeof body.hiring_enabled !== 'undefined') {
      updateFields.push(`hiring_enabled = $${paramIndex}`)
      updateValues.push(toBool(body.hiring_enabled))
      paramIndex++
    }

    // URL поля - обрабатываем каждое отдельно
    const urlFields: Array<[string, string]> = [
  ['avatar_url', 'avatar_url'],
  ['banner_url', 'banner_url'],
  ['telegram_url', 'telegram_url'],
  ['vk_url', 'vk_url'],
  ['discord_url', 'discord_url'],
  ['boosty_url', 'boosty_url'],
]

for (const [bodyKey, dbColumn] of urlFields) {
  // КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: проверяем, отправлен ли ключ в payload
  if (bodyKey in body) {
    const rawValue = body[bodyKey]

    if (rawValue === null || rawValue === '' || rawValue === undefined) {
      // Явно очищаем поле (ползунок выключен или поле пустое)
      updateFields.push(`${dbColumn} = $${paramIndex}`)
      updateValues.push(null)
      paramIndex++
      console.log(`Clearing ${dbColumn} - setting to NULL`)
    } else {
      // Проверяем и сохраняем валидный URL
      const validUrl = isHttpUrl(rawValue)
      if (validUrl) {
        updateFields.push(`${dbColumn} = $${paramIndex}`)
        updateValues.push(validUrl)
        paramIndex++
        console.log(`Setting ${dbColumn} to:`, validUrl)
      } else {
        // Невалидный URL - тоже очищаем
        updateFields.push(`${dbColumn} = $${paramIndex}`)
        updateValues.push(null)
        paramIndex++
        console.log(`Invalid URL for ${dbColumn}, setting to NULL`)
      }
    }
  }
}
    // Массивы
    if ('tags' in body) {
      updateFields.push(`tags = $${paramIndex}`)
      updateValues.push(toTextArray(body.tags)) // разрешить пустой массив
      paramIndex++
    }

    if ('langs' in body) {
      updateFields.push(`langs = $${paramIndex}`)
      updateValues.push(toTextArray(body.langs))
      paramIndex++
    }

    // Проверяем, что есть что обновлять
    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'empty_patch', message: 'No valid fields to update' }, { status: 400 })
    }

    // Добавляем updated_at
    updateFields.push(`updated_at = now()`)

    // Формируем финальный запрос
    updateValues.push(team.id) // Для WHERE условия
    const sql = `
      UPDATE translator_teams 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramIndex} 
      RETURNING *
    `

    console.log('Executing SQL:', sql)
    console.log('With values:', updateValues)

    const result = await query(sql, updateValues)

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'team_not_found' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      team: result.rows[0],
      message: 'Team updated successfully'
    })

  } catch (e) {
    console.error('Team edit PATCH error:', e)
    return NextResponse.json({
      error: 'internal_error',
      message: 'Server error occurred',
      detail: process.env.NODE_ENV === 'development' ? (e instanceof Error ? e.message : String(e)) : undefined
    }, { status: 500 })
  }
}
