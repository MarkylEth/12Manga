// app/admin/title-suggestions/actions.ts
'use server';

/**
 * Заглушки server actions для админ-панели предложений тайтлов.
 * Без Supabase. Ориентируемся на REST-роуты (если их ещё нет — просто не падаем).
 */

type Suggestion = {
  id: number | string;
  type: 'new_title' | 'edit_title' | string;
  created_at?: string;
  payload?: any;
  author_comment?: string | null;
  status?: 'pending' | 'approved' | 'rejected';
};

function ok<T>(v: T) { return { ok: true as const, data: v }; }
function err(message: string) { return { ok: false as const, error: message }; }

export async function listTitleSuggestions() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/admin/title-suggestions`, { cache: 'no-store' });
    if (!res.ok) return err(`HTTP ${res.status}`);
    const js = await res.json().catch(() => ({}));
    const items: Suggestion[] = Array.isArray(js?.items) ? js.items : [];
    return ok(items);
  } catch (e: any) {
    // если роутов ещё нет — отдаём пусто, чтобы UI не падал
    return ok([] as Suggestion[]);
  }
}

export async function approveSuggestion(id: number | string) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/admin/title-suggestions/${id}/approve`, {
      method: 'POST',
    });
    if (!res.ok) return err(`HTTP ${res.status}`);
    const js = await res.json().catch(() => ({}));
    if (js?.ok) return ok(true);
    return err(js?.error || 'Не удалось применить заявку');
  } catch (e: any) {
    return err('Эндпоинт не настроен (нужно /api/admin/title-suggestions/[id]/approve)');
  }
}

export async function rejectSuggestion(id: number | string, reason?: string) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/admin/title-suggestions/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || null }),
    });
    if (!res.ok) return err(`HTTP ${res.status}`);
    const js = await res.json().catch(() => ({}));
    if (js?.ok) return ok(true);
    return err(js?.error || 'Не удалось отклонить заявку');
  } catch (e: any) {
    return err('Эндпоинт не настроен (нужно /api/admin/title-suggestions/[id]/reject)');
  }
}
