// app/api/chats/[chatId]/messages/[messageId]/react/route.ts
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { pushReaction } from '@/lib/realtime/sse-broker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureMember(userId: string, chatId: number) {
  const r = await query(
    `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2::uuid`,
    [chatId, userId]
  );
  return r.rowCount > 0;
}

export async function POST(req: Request, ctx: { params: { chatId: string; messageId: string } }) {
  try {
    const me = await getAuthUser();
    if (!me?.id) return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });

    const chatId = Number(ctx.params.chatId);
    const messageId = Number(ctx.params.messageId);
    const { emoji } = await req.json().catch(() => ({}));
    const em = (emoji || '').toString();

    if (!em) return NextResponse.json({ ok: false, message: 'emoji required' }, { status: 400 });
    if (!(await ensureMember(me.id, chatId))) {
      return NextResponse.json({ ok: false, message: 'forbidden' }, { status: 403 });
    }

    // сообщение принадлежит чату?
    const chk = await query(`SELECT 1 FROM chat_messages WHERE id=$1 AND chat_id=$2`, [messageId, chatId]);
    if (!chk.rowCount) return NextResponse.json({ ok: false, message: 'not found' }, { status: 404 });

    // toggle
    const del = await query(
      `DELETE FROM chat_message_reactions WHERE message_id=$1 AND user_id=$2::uuid AND emoji=$3`,
      [messageId, me.id, em]
    );
    if (del.rowCount === 0) {
      await query(
        `INSERT INTO chat_message_reactions (message_id, user_id, emoji) VALUES ($1, $2::uuid, $3)`,
        [messageId, me.id, em]
      );
    }

    // подсчёт
    const agg = await query(
      `SELECT emoji, COUNT(*)::int AS cnt
       FROM chat_message_reactions
       WHERE message_id = $1
       GROUP BY emoji
       ORDER BY emoji`,
      [messageId]
    );

    const mine = await query(
      `SELECT emoji FROM chat_message_reactions WHERE message_id=$1 AND user_id=$2::uuid`,
      [messageId, me.id]
    );

    const payload = {
      message_id: messageId,
      counts: agg.rows.map(r => ({ emoji: r.emoji, count: r.cnt })),
      mine: mine.rows.map(r => r.emoji),
    };

    pushReaction(chatId, payload);
    return NextResponse.json({ ok: true, ...payload });

  } catch (e) {
    console.error('[POST react] ', e);
    return NextResponse.json({ ok: false, message: 'failed' }, { status: 500 });
  }
}
