// lib/admin/guard.ts
// ⛳️ Админ-гварды переведены в "мягкий" режим:
// — авторизация отключена, поэтому проверок прав нет;
// — возвращаем консервативные значения (скрывать админ‑кнопки), но не ломаем маршруты.

import React from 'react'

/** Роль пользователя в старой системе (оставлено для совместимости типов) */
export type Role = 'admin' | 'moderator' | 'user' | 'guest'
export type UserLike = null

/** Везде возвращаем false, чтобы UI не показывал опасные действия. */
export function isAdmin(_user?: UserLike): boolean {
  return false
}
export function isModerator(_user?: UserLike): boolean {
  return false
}

/** Хелпер для условного рендера (скрывает children без auth) */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  if (!isAdmin(null)) return null
  return {children}
}

/** Совместимый no-op — раньше бросал/редиректил. */
export function assertAdmin(_user?: UserLike) {
  // auth отключён — ничего не делаем
}
