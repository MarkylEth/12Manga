'use client'

import React from 'react'
import { ThemeProvider } from '@/lib/theme/context'
import { AuthProvider } from '@/lib/auth/context'

/**
 * Единая обёртка провайдеров приложения.
 * Auth сейчас «заглушка» (своя регистрация будет позже),
 * Theme — твой провайдер темы.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </AuthProvider>
  )
}