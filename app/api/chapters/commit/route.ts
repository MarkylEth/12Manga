import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUploader } from '@/lib/auth/route-guards';

type PageIn = {
  index: number;         // 1..N
  key: string;           // r2 object key
  url: string;           // public https url
  name?: string;         // оригинальное имя файла (необязательно)
};

type Body = {
  // допускаем разные ключи на всякий случай
  chapterId?: number | string;
  id?: number | string;
  chapter_id?: number | string;
  pages?: PageIn[];
};

// наличие колонки
async function hasColumn(table: string, col: string) {
  const { rowCount } = await query(
    `select 1 
       from information_schema.columns 
      where table_schema='public' and table_name=$1 and column_name=$2 limit 1`,
    [table, col]
  );
  return (rowCount ?? 0) > 0;
}

export async function POST(req: NextRequest) {
  const guard = await requireUploader(req as unknown as Request);
  if (!guard.ok) {
    const status = guard.reason === 'no_session' ? 401 : 403;
    return NextResponse.json({ ok: false, message: 'unauthorized' }, { status });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad JSON' }, { status: 400 });
  }

  const rawId = body.chapterId ?? body.id ?? body.chapter_id;
  const chapterId = Number(rawId ?? 0);
  if (!chapterId) {
    return NextResponse.json({ ok: false, message: 'chapterId обязателен' }, { status: 400 });
  }

  const pages = Array.isArray(body.pages) ? body.pages : [];
  if (pages.length === 0) {
    return NextResponse.json({ ok: false, message: 'pages пуст' }, { status: 400 });
  }

  // что есть в схемах
  const cpHas = await query(
    `select to_regclass('public.chapter_pages')::text as t`
  ).then(r => Boolean(r.rows?.[0]?.t));
  if (!cpHas) {
    return NextResponse.json({ ok: false, message: 'Таблица chapter_pages не найдена' }, { status: 500 });
  }

  const colImage = (await hasColumn('chapter_pages', 'image_url')) ? 'image_url' : null;
  const colNum = (await hasColumn('chapter_pages', 'page_number')) ? 'page_number' : null;
  const colIdx = (await hasColumn('chapter_pages', 'page_index')) ? 'page_index' : null;

  if (!colImage) {
    return NextResponse.json({ ok: false, message: 'В chapter_pages нет image_url' }, { status: 500 });
  }

  // транзакция
  try {
    await query('begin');

    // подчистим предыдущие страницы
    await query('delete from chapter_pages where chapter_id = $1', [chapterId]);

    // bulk insert
    // строим VALUES ($1,$2,$3), ... динамически
    const vals: any[] = [];
    const rowsSql: string[] = [];
    let p = 0;

    for (const pg of pages) {
      const n = Number(pg.index || 0) || 0;
      const pageNumber = n > 0 ? n : 0;

      // минимальный набор: chapter_id, image_url
      const cols: string[] = ['chapter_id', colImage!];
      const ph: string[] = [`$${++p}`, `$${++p}`];
      vals.push(chapterId, String(pg.url || pg.key || ''));

      if (colNum) { cols.push(colNum); vals.push(pageNumber); ph.push(`$${++p}`); }
      if (colIdx) { cols.push(colIdx); vals.push(pageNumber - 1); ph.push(`$${++p}`); } // zero-based

      rowsSql.push(`(${cols.join(',')}) values (${ph.join(',')})`);
      // преобразуем к INSERT INTO ... SELECT ... UNION ALL, чтобы разные наборы колонок не мешали
    }

    // так как колонок переменный набор — вставляем построчно (это быстрее чем отдельные запросы, но проще по колонкам)
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      const pageNumber = Math.max(1, Number(pg.index || i + 1));
      const cols = ['chapter_id', colImage!] as string[];
      const ph: string[] = ['$1', '$2'];
      const valsRow: any[] = [chapterId, String(pg.url || pg.key || '')];

      if (colNum) { cols.push(colNum); ph.push(`$${valsRow.length + 1}`); valsRow.push(pageNumber); }
      if (colIdx) { cols.push(colIdx); ph.push(`$${valsRow.length + 1}`); valsRow.push(pageNumber - 1); }

      await query(
        `insert into chapter_pages (${cols.join(',')}) values (${ph.join(',')})`,
        valsRow
      );
    }

    // обновим главу: статус/кол-во страниц
    const hasStatus = await hasColumn('chapters', 'status');
    const hasPagesCount = await hasColumn('chapters', 'pages_count');

    const sets: string[] = [];
    const updVals: any[] = [];
    let k = 0;

    if (hasStatus) { sets.push(`status = $${++k}`); updVals.push('ready'); }
    if (hasPagesCount) { sets.push(`pages_count = $${++k}`); updVals.push(pages.length); }
    updVals.push(chapterId);

    if (sets.length) {
      await query(`update chapters set ${sets.join(', ')} where id = $${++k}`, updVals);
    }

    // достанем manga_id ради readUrl
    const manga = await query('select manga_id from chapters where id=$1', [chapterId])
      .then(r => Number(r.rows?.[0]?.manga_id ?? 0));

    await query('commit');

    return NextResponse.json({
      ok: true,
      chapterId,
      readUrl: manga ? `/manga/${manga}/chapter/${chapterId}` : undefined,
    });
  } catch (e: any) {
    await query('rollback').catch(() => {});
    return NextResponse.json({ ok: false, message: String(e?.message || e) }, { status: 500 });
  }
}
