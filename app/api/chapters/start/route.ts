// app/api/chapters/start/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireLoggedIn } from '@/lib/auth/route-guards';

export const dynamic = 'force-dynamic';

type Body = {
  mangaId?: number | string;
  chapterNumber?: number | string;
  volume?: number | string | null;
  title?: string | null;
};

function toInt(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export async function POST(req: Request) {
  try {
    const auth = await requireLoggedIn(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });
    }
    const uid = auth.user.id; // uuid

    const body = (await req.json().catch(() => ({}))) as Body;
    const mangaId = toInt(body.mangaId);
    const chapterNumber = toInt(body.chapterNumber);
    const volumeNumber = body.volume === '' || body.volume == null ? null : toInt(body.volume);
    const title = (body.title ?? '').trim() || null;

    if (!mangaId || !chapterNumber) {
      return NextResponse.json(
        { ok: false, message: 'mangaId и chapterNumber обязательны' },
        { status: 400 },
      );
    }

    // Читаем фактические колонки таблицы
    const meta = await query<{
      column_name: string;
      is_nullable: 'YES' | 'NO';
      column_default: string | null;
      data_type: string;
    }>(
      `
      select column_name, is_nullable, column_default, data_type
      from information_schema.columns
      where table_schema = 'public' and table_name = 'chapters'
      `,
    );

    const has = (name: string) => meta.rows.some((r) => r.column_name === name);
    const nn = (name: string) =>
      meta.rows.some((r) => r.column_name === name && r.is_nullable === 'NO');

    // Формируем динамический INSERT только по существующим колонкам.
    const cols: string[] = [];
    const vals: any[] = [];
    const ph: string[] = [];

    const push = (name: string, value: any) => {
      cols.push(name);
      vals.push(value);
      ph.push(`$${vals.length}`);
    };

    // Обязательные поля
    push('manga_id', mangaId);
    push('chapter_number', chapterNumber);

    if (has('title')) push('title', title);
    if (has('status')) push('status', 'draft');

    // Частые техполя — ставим безопасные значения, если колонка существует
    if (has('pages_count')) push('pages_count', 0);
    if (has('likes_count')) push('likes_count', 0);

    // Кто загрузил — важное, часто NOT NULL
    if (has('uploaded_by')) push('uploaded_by', uid);
    if (has('user_id')) push('user_id', uid);
    if (has('created_by')) push('created_by', uid);

    // Том/индексы (если у вас есть такие поля)
    if (volumeNumber != null && has('volume_number')) push('volume_number', volumeNumber);
    if (volumeNumber != null && has('vol_number')) push('vol_number', volumeNumber);

    // created_at/updated_at обычно с DEFAULT now(), но если внезапно NOT NULL без дефолта —
    // подстрахуемся: проставим сейчас
    if (has('created_at') && nn('created_at') && !meta.rows.find(r => r.column_name === 'created_at')?.column_default) {
      // нельзя передать now() параметром, поэтому пусть DB сама выставит DEFAULT:
      // если дефолта нет, добавим явное значение
      push('created_at', new Date());
    }
    if (has('updated_at') && nn('updated_at') && !meta.rows.find(r => r.column_name === 'updated_at')?.column_default) {
      push('updated_at', new Date());
    }

    // Выполняем динамический INSERT
    const sql = `INSERT INTO public.chapters (${cols.join(',')}) VALUES (${ph.join(',')}) RETURNING id`;
    let insertedId: number | null = null;

    try {
      const { rows } = await query<{ id: number }>(sql, vals);
      insertedId = rows?.[0]?.id ?? null;
    } catch (e) {
      // Как крайний случай — ещё раз, минимально: только manga_id, chapter_number, status, title (+uploaded_by, user_id, если существуют и NOT NULL)
      const cols2: string[] = [];
      const vals2: any[] = [];
      const ph2: string[] = [];
      const push2 = (name: string, value: any) => {
        cols2.push(name);
        vals2.push(value);
        ph2.push(`$${vals2.length}`);
      };

      push2('manga_id', mangaId);
      push2('chapter_number', chapterNumber);
      if (has('status')) push2('status', 'draft');
      if (has('title')) push2('title', title);

      if (has('uploaded_by')) push2('uploaded_by', uid);
      if (has('user_id')) push2('user_id', uid);

      const sql2 = `INSERT INTO public.chapters (${cols2.join(',')}) VALUES (${ph2.join(',')}) RETURNING id`;
      const { rows } = await query<{ id: number }>(sql2, vals2);
      insertedId = rows?.[0]?.id ?? null;
    }

    if (!insertedId) {
      return NextResponse.json(
        { ok: false, message: 'БД не вернула id новой главы' },
        { status: 500 },
      );
    }

    // Пост-апдейты — best effort, чтобы не падать из-за отсутствия колонок
    if (has('volume_number') && volumeNumber != null) {
      await query(`UPDATE public.chapters SET volume_number = $1 WHERE id = $2`, [
        volumeNumber,
        insertedId,
      ]).catch(() => {});
    }
    if (has('pages_count')) {
      await query(`UPDATE public.chapters SET pages_count = COALESCE(pages_count,0) WHERE id = $1`, [
        insertedId,
      ]).catch(() => {});
    }
    if (has('uploaded_by')) {
      await query(
        `UPDATE public.chapters SET uploaded_by = COALESCE(uploaded_by, $2) WHERE id = $1`,
        [insertedId, uid],
      ).catch(() => {});
    }
    if (has('user_id')) {
      await query(`UPDATE public.chapters SET user_id = COALESCE(user_id, $2) WHERE id = $1`, [
        insertedId,
        uid,
      ]).catch(() => {});
    }
    if (has('created_by')) {
      await query(`UPDATE public.chapters SET created_by = COALESCE(created_by, $2) WHERE id = $1`, [
        insertedId,
        uid,
      ]).catch(() => {});
    }

    const baseKey = `staging/manga/${mangaId}/chapters/${insertedId}`;

    return NextResponse.json({
      ok: true,
      chapterId: insertedId,
      id: insertedId,
      baseKey,
    });
  } catch (err: any) {
    console.error('chapters/start error:', err);
    return NextResponse.json(
      { ok: false, message: err?.message || 'Internal Server Error' },
      { status: 500 },
    );
  }
}
