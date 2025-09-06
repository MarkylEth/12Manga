import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ПОМОЩЬНИКИ
 */
async function findExistingDM(a: string, b: string) {
  // 1) через chat_members (работает даже если поле dm_pair пустое)
  const q1 = await query(
    `SELECT c.id
       FROM chats c
       JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = $1::uuid
       JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = $2::uuid
      WHERE c.type = 'dm'
      LIMIT 1`,
    [a, b]
  );
  if (q1.rowCount) return Number(q1.rows[0].id);

  // 2) через поле dm_pair (если оно у тебя есть и заполнялось)
  try {
    const q2 = await query(
      `SELECT id FROM chats
        WHERE type = 'dm'
          AND dm_pair = ARRAY[LEAST($1::uuid,$2::uuid), GREATEST($1::uuid,$2::uuid)]::uuid[]
        LIMIT 1`,
      [a, b]
    );
    if (q2.rowCount) return Number(q2.rows[0].id);
  } catch { /* поле dm_pair может отсутствовать — ок */ }

  return null;
}

/**
 * POST /api/chats
 * body: { type: 'dm', userId: '<uuid>' }
 */
export async function POST(req: Request) {
  const me = await getAuthUser();
  if (!me?.id) return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const type = body?.type === 'group' ? 'group' : 'dm';

  if (type !== 'dm') {
    return NextResponse.json({ ok: false, message: 'only_dm_supported_here' }, { status: 400 });
  }

  const otherId = String(body?.userId || '').trim();
  if (!otherId || otherId === me.id) {
    return NextResponse.json({ ok: false, message: 'userId required' }, { status: 400 });
  }

  const a = me.id;
  const b = otherId;

  try {
    // 0) вдруг уже существует
    const found = await findExistingDM(a, b);
    if (found) return NextResponse.json({ ok: true, chatId: found });

    // 1) создаём в транзакции, чтобы два параллельных запроса не сделали дубликаты
    await query('BEGIN');

    // 1.1) ещё раз попробуем найти — вдруг другой процесс уже создал
    const again = await findExistingDM(a, b);
    if (again) {
      await query('ROLLBACK');
      return NextResponse.json({ ok: true, chatId: again });
    }

    // 1.2) создаём чат
    // если у тебя есть колонка dm_pair и на неё уникальный индекс — используем её тоже
    // рекомендую добавить индекс:
    // CREATE UNIQUE INDEX IF NOT EXISTS uniq_chats_dm_pair ON chats (dm_pair) WHERE type='dm';
    let chatId: number;
    try {
      const ins = await query(
        `INSERT INTO chats (type, created_by, dm_pair)
         VALUES ('dm', $1::uuid, ARRAY[LEAST($1::uuid,$2::uuid), GREATEST($1::uuid,$2::uuid)]::uuid[])
         RETURNING id`,
        [a, b]
      );
      chatId = Number(ins.rows[0].id);
    } catch {
      // если dm_pair отсутствует — создаём без него
      const ins = await query(
        `INSERT INTO chats (type, created_by)
         VALUES ('dm', $1::uuid)
         RETURNING id`,
        [a]
      );
      chatId = Number(ins.rows[0].id);
    }

    // 1.3) участники
    await query(
      `INSERT INTO chat_members (chat_id, user_id, role)
       VALUES ($1, $2::uuid, 'member'), ($1, $3::uuid, 'member')
       ON CONFLICT DO NOTHING`,
      [chatId, a, b]
    );

    await query('COMMIT');
    return NextResponse.json({ ok: true, chatId });
  } catch (e) {
    await query('ROLLBACK').catch(() => {});
    // при гонке с уникальным индексом, сразу попробуем найти ещё раз
    const exists = await findExistingDM(a, b);
    if (exists) return NextResponse.json({ ok: true, chatId: exists });
    console.error('Error creating DM:', e);
    return NextResponse.json({ ok: false, message: 'Failed to create chat' }, { status: 500 });
  }
}
