// lib/auth/guards.ts (client-friendly)
export type UserLike = { id: number; role?: 'admin'|'moderator'|'user' } | null;
export type ProfileLike = any | null;

// Базовые проверки для UI (если есть user — можно точнее)
export function isLoggedIn(user?: UserLike) { return !!user }
export function isAdmin(user?: UserLike) { return user?.role === 'admin' }
export function isModerator(user?: UserLike) { return user?.role === 'admin' || user?.role === 'moderator' }

// Доменные проверки (можно расширять логикой)
export function canEditTitle(user?: UserLike) { return isModerator(user) }
export function canAddChapter(user?: UserLike) { return isModerator(user) }
export function canModerateComments(user?: UserLike) { return isModerator(user) }
export function canManageTeams(user?: UserLike) { return isAdmin(user) }
export function canPinComments(user?: UserLike) { return isModerator(user) }
export function canDeleteComments(user?: UserLike) { return isModerator(user) }

// Хелпер для onClick — ничего не ломает, просто игнорирует действие
export function guard(action: () => void) {
  return () => { /* noop для клиента; реальная проверка — на сервере */ }
}
