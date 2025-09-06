import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { pushPin } from '@/lib/realtime/sse-broker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureMember(userId: string, chatId: number) {
  const r = await query(`SELECT 1 FROM chat_members WHERE chat_id=$1 AND user_id=$2::uuid`, [chatId, userId]);
  return r.rowCount > 0;
}

export async function POST(req: Request, ctx: { params: { chatId: string } }) {
  try {
    const me = await getAuthUser();
    if (!me?.id) return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });

    const chatId = Number(ctx.params.chatId);
    if (!chatId || isNaN(chatId)) return NextResponse.json({ ok: false, message: 'bad chat' }, { status: 400 });
    if (!(await ensureMember(me.id, chatId))) return NextResponse.json({ ok: false, message: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(()=> ({}));
    const messageId = body?.messageId ? Number(body.messageId) : null;

    if (messageId) {
      const chk = await query(`SELECT 1 FROM chat_messages WHERE id=$1 AND chat_id=$2 AND deleted_at IS NULL`, [messageId, chatId]);
      if (!chk.rowCount) return NextResponse.json({ ok: false, message: 'not found' }, { status: 404 });
    }

    await query(`UPDATE chats SET pinned_message_id=$1 WHERE id=$2`, [messageId, chatId]);

    // вернём короткий объект для баннера
    let pinned: any = null;
    if (messageId) {
      const r = await query(
        `SELECT m.id, m.chat_id, m.user_id, m.body, m.created_at,
                p.full_name, p.avatar_url
         FROM chat_messages m LEFT JOIN profiles p ON p.id = m.user_id
         WHERE m.id=$1`, [messageId]
      );
      if (r.rowCount) {
        const x = r.rows[0];
        pinned = {
          id: x.id, chat_id: x.chat_id, user_id: x.user_id, body: x.body, created_at: x.created_at,
          user: { full_name: x.full_name, avatar_url: x.avatar_url }
        };
      }
    }

    pushPin(chatId, { pinned });
    return NextResponse.json({ ok: true, pinned });
  } catch (e) {
    console.error('[POST /api/chats/[chatId]/pin] error', e);
    return NextResponse.json({ ok: false, message: 'internal' }, { status: 500 });
  }
}
