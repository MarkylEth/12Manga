'use client';
import { useTheme } from '@/lib/theme/context';
import { Settings } from 'lucide-react';

export function SystemSettings() {
  const { theme } = useTheme();
  const textClass = theme === 'light' ? 'text-gray-900' : 'text-white';
  const mutedTextClass = theme === 'light' ? 'text-gray-600' : 'text-slate-400';

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Системные настройки</h1>
        <p className={mutedTextClass}>Конфигурация системы и глобальные настройки платформы</p>
      </div>
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Settings className={`w-16 h-16 mx-auto mb-4 ${mutedTextClass}`} />
          <h3 className={`text-lg font-semibold ${textClass} mb-2`}>Системные настройки</h3>
          <p className={mutedTextClass}>Панель системных настроек будет добавлена позже</p>
        </div>
      </div>
    </div>
  );
}
