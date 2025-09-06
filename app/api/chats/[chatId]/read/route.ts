import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { pushRead } from '@/lib/realtime/sse-broker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureMember(userId: string, chatId: number) {
  const r = await query(
    `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2::uuid`,
    [chatId, userId]
  );
  return r.rowCount > 0;
}

export async function POST(req: Request, ctx: { params: { chatId: string } }) {
  try {
    const me = await getAuthUser();
    if (!me?.id) {
      return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });
    }

    const chatId = Number(ctx.params.chatId);
    if (!chatId || isNaN(chatId)) {
      return NextResponse.json({ ok: false, message: 'Invalid chat ID' }, { status: 400 });
    }

    if (!(await ensureMember(me.id, chatId))) {
      return NextResponse.json({ ok: false, message: 'You are not a member of this chat' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const lastMessageId = Number(body?.lastMessageId ?? 0);
    
    if (!lastMessageId) {
      return NextResponse.json({ ok: false, message: 'lastMessageId is required' }, { status: 400 });
    }

    // Проверить что сообщение существует в этом чате
    const messageCheck = await query(
      `SELECT id FROM chat_messages WHERE id = $1 AND chat_id = $2 AND deleted_at IS NULL`,
      [lastMessageId, chatId]
    );

    if (messageCheck.rowCount === 0) {
      return NextResponse.json({ ok: false, message: 'Message not found in this chat' }, { status: 404 });
    }

    // Обновить статус прочтения
    await query(
      `INSERT INTO chat_reads (chat_id, user_id, last_read_message_id, last_read_at)
       VALUES ($1, $2::uuid, $3, now())
       ON CONFLICT (chat_id, user_id) DO UPDATE SET
         last_read_message_id = GREATEST(chat_reads.last_read_message_id, EXCLUDED.last_read_message_id),
         last_read_at = now()`,
      [chatId, me.id, lastMessageId]
    );

    // Уведомить других участников
    pushRead(chatId, me.id, lastMessageId);

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('[POST /api/chats/[chatId]/read] Error:', error);
    return NextResponse.json({ 
      ok: false, 
      message: 'Failed to update read status' 
    }, { status: 500 });
  }
}