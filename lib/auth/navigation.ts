// lib/auth/navigation.ts
// Формирование навигации без привязки к ролям. Админ‑разделы скрыты до ввода кастомного Auth.

export type NavItem = { label: string; href: string; external?: boolean }

export function getMainNav(): NavItem[] {
  return [
    { label: 'Главная', href: '/' },
    { label: 'Каталог', href: '/catalog' },
    { label: 'Команды', href: '/teams' },
    { label: 'О проекте', href: '/about' },
  ]
}

export function getUserMenu(): NavItem[] {
  // Раньше зависело от user/role — сейчас статично
  return [
    { label: 'Мой профиль', href: '/profile' },
    { label: 'Закладки', href: '/me/library' },
    { label: 'Настройки', href: '/settings' },
  ]
}

export function getAdminNav(): NavItem[] {
  // Auth отключён — админ‑пункты не показываем
  return []
}
