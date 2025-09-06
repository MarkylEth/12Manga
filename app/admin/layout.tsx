// app/admin/layout.tsx
import type { ReactNode } from 'react';
import '@/app/globals.css';

export default function AdminLayout({ children }: { children: ReactNode }) {
  // без auth — просто рендерим children
  return children;
}
