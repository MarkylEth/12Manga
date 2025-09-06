import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureMember(userId: string, chatId: number) {
  const r = await query(
    `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2::uuid`,
    [chatId, userId]
  );
  return r.rowCount > 0;
}

export async function GET(req: Request, ctx: { params: { chatId: string } }) {
  try {
    const me = await getAuthUser();
    if (!me?.id) {
      return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });
    }

    const chatId = Number(ctx.params.chatId);
    if (!chatId || Number.isNaN(chatId)) {
      return NextResponse.json({ ok: false, message: 'invalid_chat_id' }, { status: 400 });
    }

    // есть ли чат и его тип?
    const chatQ = await query(
      `SELECT id, type FROM chats WHERE id = $1 LIMIT 1`,
      [chatId]
    );
    if (chatQ.rowCount === 0) {
      return NextResponse.json({ ok: false, message: 'not_found' }, { status: 404 });
    }

    // доступ
    if (!(await ensureMember(me.id, chatId))) {
      return NextResponse.json({ ok: false, message: 'forbidden' }, { status: 403 });
    }

    // участники + профили
    const memQ = await query(
      `SELECT m.user_id, m.role, p.full_name, p.avatar_url
         FROM chat_members m
         LEFT JOIN profiles p ON p.id = m.user_id
        WHERE m.chat_id = $1
        ORDER BY m.user_id`,
      [chatId]
    );

    const members = memQ.rows.map(r => ({
      user_id: r.user_id as string,
      role: r.role as string,
      full_name: r.full_name as string | null,
      avatar_url: r.avatar_url as string | null,
    }));

    // заголовок
    const type: 'dm' | 'group' = chatQ.rows[0].type;
    let title = type === 'group' ? 'Группа' : 'Диалог';

    if (type === 'dm') {
      const other = members.find(m => m.user_id !== me.id);
      if (other) {
        title = other.full_name || other.user_id;
      }
    }

    return NextResponse.json({
      ok: true,
      meId: me.id,
      chat: {
        id: chatId,
        type,
        title,
        members, // [{ user_id, role, full_name, avatar_url }]
      },
    });
  } catch (e) {
    console.error('[GET /api/chats/[chatId]]', e);
    return NextResponse.json({ ok: false, message: 'server_error' }, { status: 500 });
  }
}
