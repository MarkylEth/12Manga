'use client'

import CreateTeamButton from './CreateTeamButton'

/**
 * FAB скрыт, пока авторизация отключена.
 * Оставляем компонент, чтобы импорт не ломал страницы.
 */
export default function CreateTeamFab() {
  // Можно вернуть null, либо показать неактивную кнопку — выберем null.
  return null

  // Если захочешь всегда показывать информационную кнопку:
  // return <CreateTeamButton className="fixed bottom-5 right-5 z-50 shadow-lg" />
}
