import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { pushNewMessage } from '@/lib/realtime/sse-broker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureMember(userId: string, chatId: number) {
  const r = await query(
    `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2::uuid`,
    [chatId, userId]
  );
  return r.rowCount > 0;
}

/* =================== GET =================== */
export async function GET(req: Request, ctx: { params: { chatId: string } }) {
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
      return NextResponse.json({ ok: false, message: 'forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const beforeId = Number(url.searchParams.get('beforeId') ?? 0);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));

    // Основная выборка: сообщения + автор + данные об ответе
    const rows = await query(
      `
      SELECT 
        m.id, m.chat_id, m.user_id, m.body, COALESCE(m.kind,'text') AS kind,
        m.attachments, m.reply_to_id,
        m.created_at, m.edited_at, m.deleted_at,
        p.username, p.full_name, p.avatar_url,

        r.id          AS reply_id,
        r.user_id     AS reply_user_id,
        r.body        AS reply_body,
        r.created_at  AS reply_created_at,
        rp.full_name  AS reply_full_name,
        rp.avatar_url AS reply_avatar_url
      FROM chat_messages m
      LEFT JOIN profiles p  ON p.id  = m.user_id
      LEFT JOIN chat_messages r ON r.id = m.reply_to_id
      LEFT JOIN profiles rp ON rp.id = r.user_id
      WHERE m.chat_id = $1
        AND m.deleted_at IS NULL
        AND ($2 = 0 OR m.id < $2)
      ORDER BY m.id DESC
      LIMIT $3
      `,
      [chatId, beforeId, limit]
    );

    const itemsRaw = rows.rows;

    // Реакции: берём пакетно, но не падаем, если таблицы нет
    const ids: number[] = itemsRaw.map(r => r.id);
    let reactionsMap: Record<number, { emoji: string; count: number; mine: boolean }[]> = {};
    if (ids.length) {
      try {
        const reactRes = await query(
          `
          WITH agg AS (
            SELECT message_id, emoji, COUNT(*)::int AS cnt
            FROM chat_message_reactions
            WHERE message_id = ANY($1::int[])
            GROUP BY message_id, emoji
          ),
          mine AS (
            SELECT message_id, emoji
            FROM chat_message_reactions
            WHERE message_id = ANY($1::int[]) AND user_id = $2::uuid
          )
          SELECT a.message_id, a.emoji, a.cnt,
                 EXISTS(SELECT 1 FROM mine m 
                        WHERE m.message_id=a.message_id AND m.emoji=a.emoji) AS mine
          FROM agg a
          ORDER BY a.message_id, a.emoji
          `,
          [ids, me.id]
        );
        for (const r of reactRes.rows) {
          if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
          reactionsMap[r.message_id].push({
            emoji: r.emoji,
            count: Number(r.cnt),
            mine: !!r.mine,
          });
        }
      } catch {
        // таблицы нет — просто игнорируем реакции
        reactionsMap = {};
      }
    }

    const messages = itemsRaw.map(row => ({
      id: row.id,
      chat_id: row.chat_id,
      user_id: row.user_id,
      body: row.body,
      kind: row.kind || 'text',
      attachments: row.attachments,
      reply_to_id: row.reply_to_id,
      created_at: row.created_at,
      edited_at: row.edited_at,
      user: {
        username: row.username,
        full_name: row.full_name,
        avatar_url: row.avatar_url,
      },
      reply_to: row.reply_id
        ? {
            id: row.reply_id,
            user_id: row.reply_user_id,
            body: row.reply_body,
            created_at: row.reply_created_at,
            user: {
              full_name: row.reply_full_name,
              avatar_url: row.reply_avatar_url,
            },
          }
        : null,
      reactions: reactionsMap[row.id] || [],
    }));

    return NextResponse.json({
      ok: true,
      items: messages.reverse(), // по возрастанию на клиент
      hasMore: itemsRaw.length === limit,
    });
  } catch (error) {
    console.error('[GET /api/chats/[chatId]/messages] Error:', error);
    return NextResponse.json(
      { ok: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/* =================== POST =================== */
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
      return NextResponse.json({ ok: false, message: 'forbidden' }, { status: 403 });
    }

    const json = await req.json().catch(() => ({}));
    const text = (json?.text ?? '').toString().trim();
    const kind = (json?.kind ?? 'text').toString();
    const replyToId =
      json?.reply_to_id != null ? Number(json.reply_to_id) : null;

    if (!text) {
      return NextResponse.json({ ok: false, message: 'Message content required' }, { status: 400 });
    }
    if (text.length > 4000) {
      return NextResponse.json({ ok: false, message: 'Message too long (max 4000)' }, { status: 400 });
    }

    // если указан ответ — проверим, что сообщение в этом чате
    if (replyToId) {
      const chk = await query(
        `SELECT 1 FROM chat_messages WHERE id=$1 AND chat_id=$2 AND deleted_at IS NULL`,
        [replyToId, chatId]
      );
      if (!chk.rowCount) {
        return NextResponse.json({ ok: false, message: 'Reply target not found' }, { status: 404 });
      }
    }

    // Вставка
    const ins = await query(
      `INSERT INTO chat_messages (chat_id, user_id, kind, body, reply_to_id)
       VALUES ($1, $2::uuid, $3, $4, $5) 
       RETURNING *`,
      [chatId, me.id, kind, text, replyToId]
    );
    const message = ins.rows[0];

    // Обновим read для отправителя
    await query(
      `INSERT INTO chat_reads (chat_id, user_id, last_read_message_id, last_read_at)
       VALUES ($1, $2::uuid, $3, now())
       ON CONFLICT (chat_id, user_id) DO UPDATE SET
         last_read_message_id = GREATEST(chat_reads.last_read_message_id, EXCLUDED.last_read_message_id),
         last_read_at = now()`,
      [chatId, me.id, message.id]
    );

    // Профиль автора
    const profileResult = await query(
      `SELECT username, full_name, avatar_url FROM profiles WHERE id = $1::uuid`,
      [me.id]
    );
    const profile = profileResult.rows[0];

    // Если это ответ — подтянем короткие данные исходного сообщения
    let replyObj: any = null;
    if (replyToId) {
      const r = await query(
        `SELECT m.id, m.user_id, m.body, m.created_at, p.full_name, p.avatar_url
         FROM chat_messages m
         LEFT JOIN profiles p ON p.id = m.user_id
         WHERE m.id=$1`,
        [replyToId]
      );
      if (r.rowCount) {
        const x = r.rows[0];
        replyObj = {
          id: x.id,
          user_id: x.user_id,
          body: x.body,
          created_at: x.created_at,
          user: { full_name: x.full_name, avatar_url: x.avatar_url },
        };
      }
    }

    const messageWithUser = {
      ...message,
      user: {
        username: profile?.username,
        full_name: profile?.full_name,
        avatar_url: profile?.avatar_url,
      },
      reply_to: replyObj,
      reactions: [],
    };

    // Разослать участникам
    pushNewMessage(chatId, messageWithUser);

    return NextResponse.json({ ok: true, message: messageWithUser });
  } catch (error) {
    console.error('[POST /api/chats/[chatId]/messages] Error:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to send message' },
      { status: 500 }
    );
  }
}
