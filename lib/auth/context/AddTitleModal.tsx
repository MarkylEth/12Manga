// lib/auth/context/AddTitleModal.tsx
'use client'

// Раньше этот модуль требовал авторизацию и собственный контекст.
// Теперь просто реэкспортируем безопасную версию модалки без auth.
export { default, default as AddTitleModal } from '@/components/AddTitleModal'
