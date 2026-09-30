export type SessionUser = { username: string; mustChangePassword: boolean }

export function sessionRedirect(path: string, user: SessionUser | null) {
  if (!user) return path === '/login' ? undefined : '/login'
  if (user.mustChangePassword) return path === '/settings' ? undefined : '/settings?firstLogin=1'
  return path === '/login' ? '/wardrobe' : undefined
}

export const canUseCloset = (user: SessionUser | null) => Boolean(user && !user.mustChangePassword)
