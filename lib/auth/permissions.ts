// lib/auth/permissions.ts
// Таблица прав упрощена. Auth отключён — всегда false, но оставлены типы и API.

export type Permission =
  | 'title.edit'
  | 'chapter.create'
  | 'comment.moderate'
  | 'comment.pin'
  | 'comment.delete'
  | 'team.manage'
  | 'admin.panel'

export type UserLike = null

export function hasPermission(_user: UserLike, _perm: Permission): boolean {
  return false
}

// Для совместимости с возможными импортами:
export const ALL_PERMISSIONS: Permission[] = [
  'title.edit',
  'chapter.create',
  'comment.moderate',
  'comment.pin',
  'comment.delete',
  'team.manage',
  'admin.panel',
]
