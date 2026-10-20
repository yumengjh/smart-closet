export type SessionUser = { username: string; displayName?: string | null; role?: 'ADMIN' | 'USER'; mustChangePassword: boolean; portableLogin?: boolean }

export function sessionRedirect(path: string, user: SessionUser | null) {
  if (!user) return ['/login', '/register'].includes(path) ? undefined : '/login'
  if (user.mustChangePassword) return path === '/settings' ? undefined : '/settings?firstLogin=1'
  return ['/login', '/register'].includes(path) ? '/wardrobe' : undefined
}

export const canUseCloset = (user: SessionUser | null) => Boolean(user && !user.mustChangePassword)
