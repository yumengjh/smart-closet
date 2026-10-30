export const registeredViaLabels: Record<string, string> = { ADMIN: '管理员创建', INVITE: '邀请注册', OPEN: '公开注册' }
const eventLabels: Record<string, string> = {
  REGISTERED: '注册', LOGIN_SUCCEEDED: '登录', LOGIN_FAILED: '登录失败', LOGIN_LOCKED: '登录被锁定', PASSWORD_CONFIRM_FAILED: '当前密码输错', ACCESS_DENIED: '越权访问被拒', CSRF_REJECTED: '安全校验失败', INVITE_CREATED: '创建邀请码', INVITE_REVOKED: '撤销邀请码', INVITE_USED: '使用邀请码', INVITE_REJECTED: '邀请码无效', AUDIT_EXPORTED: '导出审计记录', PASSWORD_CHANGED: '修改密码', PROFILE_UPDATED: '修改资料', SESSIONS_REVOKED: '退出其他设备', DEACTIVATED: '注销账号',
  ADMIN_USER_CREATED: '管理员创建', ADMIN_USER_ENABLED: '管理员启用', ADMIN_USER_DISABLED: '管理员停用', ADMIN_ROLE_CHANGED: '管理员改角色', ADMIN_PASSWORD_RESET: '管理员重置密码', ADMIN_SESSIONS_REVOKED: '管理员退出会话', ADMIN_QUOTA_CHANGED: '管理员调整额度',
}
export function accountEventLabel(action: string): string {
  if (!action.startsWith('MANAGE_')) return eventLabels[action] || action
  const code = action.slice('MANAGE_'.length)
  const label = eventLabels[`ADMIN_${code}`] || eventLabels[code]
  return label ? `管理平台${label.replace(/^管理员/, '')}` : action
}
export const accountTime = (time: number | null | undefined) => time == null ? '暂无记录' : new Date(time).toLocaleString('zh-CN')

/** Same limits as the server (issue #155): at least 12 characters and at most 72 UTF-8 bytes, which is what BCrypt accepts. */
export const PASSWORD_MIN_CHARS = 12
export const PASSWORD_MAX_BYTES = 72
export const passwordBytes = (password: string) => new TextEncoder().encode(password).length
export function passwordProblem(password: string): string {
  if ([...password].length < PASSWORD_MIN_CHARS) return '密码至少需要 12 个字符。'
  if (passwordBytes(password) > PASSWORD_MAX_BYTES) return '密码不能超过 72 字节（英文、数字和符号各占 1 字节，汉字通常占 3 字节，表情符号占 4 字节）。'
  return ''
}

/** Same rule as the server for new usernames (issue #164): no name made of dots and no "..", which URLs treat as a path segment. */
export function usernameProblem(username: string): string {
  if (!/^[A-Za-z0-9_.-]{2,80}$/.test(username)) return '用户名需为 2–80 个字符，只能包含字母、数字、下划线、点和短横线。'
  if (username.includes('..') || /^\.+$/.test(username)) return '用户名不能只由点组成，也不能包含连续的点。'
  return ''
}
