export type SessionUser = { username: string; displayName?: string | null; role?: 'ADMIN' | 'USER'; mustChangePassword: boolean; portableLogin?: boolean; /** 行为分析：统计开启时由 /api/auth/me 返回；管理员恒为 optOut=true。 */ analytics?: { optOut: boolean } }

export function sessionRedirect(path: string, user: SessionUser | null) {
  if (!user) return ['/login', '/register'].includes(path) ? undefined : '/login'
  if (user.mustChangePassword) return path === '/settings' ? undefined : '/settings?firstLogin=1'
  return ['/login', '/register'].includes(path) ? '/today' : undefined
}

export const canUseCloset = (user: SessionUser | null) => Boolean(user && !user.mustChangePassword)
