import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { pushReaction } from '@/lib/realtime/sse-broker';

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

    const b = await req.json().catch(()=> ({}));
    const messageId = Number(b?.messageId);
    const emoji = String(b?.emoji || '').trim();
    const action: 'add'|'remove' = b?.action === 'remove' ? 'remove' : 'add';
    if (!messageId || !emoji) return NextResponse.json({ ok: false, message: 'bad payload' }, { status: 400 });

    const cur = await query(`SELECT reactions FROM chat_messages WHERE id=$1 AND chat_id=$2 AND deleted_at IS NULL`, [messageId, chatId]);
    if (!cur.rowCount) return NextResponse.json({ ok: false, message: 'not found' }, { status: 404 });

    const reactions = cur.rows[0].reactions || {};
    const arr: string[] = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    const has = arr.includes(me.id);

    if (action === 'add' && !has) arr.push(me.id);
    if (action === 'remove' && has) reactions[emoji] = arr.filter((x: string) => x !== me.id);
    else reactions[emoji] = arr;

    // уборка пустых
    Object.keys(reactions).forEach(k => { if (!Array.isArray(reactions[k]) || reactions[k].length === 0) delete reactions[k]; });

    await query(`UPDATE chat_messages SET reactions=$1 WHERE id=$2`, [reactions, messageId]);

    pushReaction(chatId, { messageId, reactions });

    return NextResponse.json({ ok: true, reactions });
  } catch (e) {
    console.error('[POST /api/chats/[chatId]/reactions] error', e);
    return NextResponse.json({ ok: false, message: 'internal' }, { status: 500 });
  }
}
