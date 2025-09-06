import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { addClient } from '@/lib/realtime/sse-broker';
import { query } from '@/lib/db';

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
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const chatId = Number(ctx.params.chatId);
    if (!chatId || isNaN(chatId)) {
      return NextResponse.json({ ok: false, message: 'Invalid chat ID' }, { status: 400 });
    }

    // Проверить членство в чате
    if (!(await ensureMember(me.id, chatId))) {
      return NextResponse.json({ ok: false, message: 'Access denied' }, { status: 403 });
    }

    console.log(`SSE: User ${me.id} connecting to chat ${chatId}`);

    // Создать SSE подключение
    const { stream, close, clientId } = addClient(chatId, me.id);

    // Обработать отключение клиента
    const abortSignal = (req as any).signal as AbortSignal | undefined;
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        console.log(`SSE: Client ${clientId} disconnected`);
        close();
      });
    }

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Cache-Control'
      },
    });

  } catch (error) {
    console.error('[GET /api/chats/[chatId]/sse] Error:', error);
    return NextResponse.json({ 
      ok: false, 
      message: 'Failed to establish SSE connection' 
    }, { status: 500 });
  }
}