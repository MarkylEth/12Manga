// app/api/teams/[slug]/follow/route.ts - ИСПРАВЛЕННАЯ ВЕРСИЯ
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getViewerId } from '@/lib/auth/route-guards';
import { resolveTeamBySlug } from '../_utils';

type Params = { params: { slug: string } }

export async function POST(req: Request, { params }: Params) {
  try {
    const uid = await getViewerId(req as any);
    if (!uid) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const team = await resolveTeamBySlug(params.slug);
    if (!team) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const { follow } = await req.json().catch(() => ({ follow: true }));

    // Начинаем транзакцию
    await query('BEGIN');

    try {
      // Проверяем текущее состояние подписки
      const currentFollowState = await query(
        'SELECT 1 FROM team_followers WHERE team_id = $1 AND user_id = $2::uuid',
        [team.id, uid]
      );

      const isCurrentlyFollowing = (currentFollowState.rowCount ?? 0) > 0;

      if (follow && !isCurrentlyFollowing) {
        // Подписываемся
        await query(
          `INSERT INTO team_followers (team_id, user_id, created_at, updated_at)
           VALUES ($1, $2::uuid, now(), now())`,
          [team.id, uid]
        );
      } else if (!follow && isCurrentlyFollowing) {
        // Отписываемся
        await query(
          'DELETE FROM team_followers WHERE team_id = $1 AND user_id = $2::uuid',
          [team.id, uid]
        );
      }

      // Получаем актуальный счетчик подписчиков
      const followersResult = await query<{ cnt: number }>(
        'SELECT count(*)::int as cnt FROM team_followers WHERE team_id = $1',
        [team.id]
      );

      const followers_count = followersResult.rows[0]?.cnt || 0;

      // Обновляем счетчик в основной таблице команды
      await query(
        'UPDATE translator_teams SET followers_count = $1, updated_at = now() WHERE id = $2',
        [followers_count, team.id]
      );

      // Проверяем финальное состояние подписки
      const finalFollowState = await query(
        'SELECT 1 FROM team_followers WHERE team_id = $1 AND user_id = $2::uuid',
        [team.id, uid]
      );

      const i_follow = (finalFollowState.rowCount ?? 0) > 0;

      await query('COMMIT');

      return NextResponse.json({ 
        ok: true, 
        i_follow,
        followers_count,
        message: i_follow ? 'Successfully followed' : 'Successfully unfollowed'
      });

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (e) {
    console.error('Follow/unfollow error:', e);
    return NextResponse.json({ 
      error: 'internal_error',
      message: 'Server error occurred',
      detail: process.env.NODE_ENV === 'development' ? (e instanceof Error ? e.message : String(e)) : undefined
    }, { status: 500 });
  }
}