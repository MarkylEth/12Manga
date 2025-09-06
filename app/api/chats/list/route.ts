// app/api/chats/list/route.ts
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const me = await getAuthUser();
    if (!me?.id) {
      return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });
    }

    const sql = `
      WITH last_messages AS (
        SELECT DISTINCT ON (chat_id)
               id, chat_id, user_id, body, created_at
        FROM chat_messages
        WHERE deleted_at IS NULL
        ORDER BY chat_id, id DESC
      ),
      unreads AS (
        SELECT m.chat_id, COUNT(*)::int AS unread
        FROM chat_messages m
        LEFT JOIN chat_reads r
          ON r.chat_id = m.chat_id AND r.user_id = $1::uuid
        WHERE m.deleted_at IS NULL
          AND m.user_id <> $1::uuid
          AND (r.last_read_message_id IS NULL OR m.id > r.last_read_message_id)
        GROUP BY m.chat_id
      ),
      my_chats AS (
        SELECT c.id, c.type, c.title
        FROM chats c
        JOIN chat_members cm ON cm.chat_id = c.id
        WHERE cm.user_id = $1::uuid
      ),
      dm_peer AS (
        SELECT cm.chat_id, cm.user_id AS peer_id
        FROM chat_members cm
        JOIN my_chats mc ON mc.id = cm.chat_id
        WHERE cm.user_id <> $1::uuid
      )
      SELECT mc.id AS chat_id,
             mc.type,
             COALESCE(mc.title, '') AS title,
             CASE WHEN mc.type = 'dm'
               THEN jsonb_build_object(
                      'id', p.id,
                      'full_name', p.full_name,
                      'avatar_url', p.avatar_url
                    )
               ELSE NULL
             END AS peer,
             to_jsonb(l.*) AS last,
             COALESCE(u.unread, 0) AS unread
      FROM my_chats mc
      LEFT JOIN dm_peer dmp ON dmp.chat_id = mc.id
      LEFT JOIN profiles p ON p.id = dmp.peer_id
      LEFT JOIN last_messages l ON l.chat_id = mc.id
      LEFT JOIN unreads u ON u.chat_id = mc.id
      ORDER BY COALESCE(l.id, 0) DESC, mc.id DESC
    `;

    const r = await query(sql, [me.id]);
    return NextResponse.json({ ok: true, items: r.rows });
  } catch (e) {
    console.error('[GET /api/chats/list]', e);
    return NextResponse.json({ ok: false, message: 'internal error' }, { status: 500 });
  }
}
