// lib/team/roles.ts

export function normalizeRole(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const v = raw.toString().trim().toLowerCase();
    if (['leader', 'lead', 'лидер', 'owner', 'глава'].includes(v)) return 'leader';
    return v;
  }
  
  export function roleLabel(role?: string | null) {
    const r = String(role || '').toLowerCase();
    switch (r) {
      case 'lead':
      case 'leader':
        return 'Лидер';
      case 'editor':
        return 'Редактор';
      case 'translator':
        return 'Переводчик';
      case 'typesetter':
        return 'Тайпсеттер';
      case 'member':
        return 'Участник';
      default:
        return null;
    }
  }
  
  export function getRoleColor(role?: string | null) {
    const r = String(role || '').toLowerCase();
    switch (r) {
      case 'lead':
      case 'leader':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'editor':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'translator':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'typesetter':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'member':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  }
  
  export function getRoleColorDark(role?: string | null) {
    const r = String(role || '').toLowerCase();
    switch (r) {
      case 'lead':
      case 'leader':
        return 'bg-amber-900/30 text-amber-300 border-amber-700/50';
      case 'editor':
        return 'bg-blue-900/30 text-blue-300 border-blue-700/50';
      case 'translator':
        return 'bg-green-900/30 text-green-300 border-green-700/50';
      case 'typesetter':
        return 'bg-purple-900/30 text-purple-300 border-purple-700/50';
      case 'member':
        return 'bg-gray-700/30 text-gray-300 border-gray-600/50';
      default:
        return 'bg-slate-700/30 text-slate-300 border-slate-600/50';
    }
  }