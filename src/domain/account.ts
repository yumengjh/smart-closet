export const registeredViaLabels: Record<string, string> = { ADMIN: '管理员创建', INVITE: '邀请注册', OPEN: '公开注册' }
const eventLabels: Record<string, string> = {
  REGISTERED: '注册', LOGIN_SUCCEEDED: '登录', LOGIN_FAILED: '登录失败', LOGIN_LOCKED: '登录被锁定', PASSWORD_CONFIRM_FAILED: '当前密码输错', ACCESS_DENIED: '越权访问被拒', CSRF_REJECTED: '安全校验失败', INVITE_CREATED: '创建邀请码', INVITE_REVOKED: '撤销邀请码', INVITE_USED: '使用邀请码', INVITE_REJECTED: '邀请码无效', PASSWORD_CHANGED: '修改密码', PROFILE_UPDATED: '修改资料', SESSIONS_REVOKED: '退出其他设备', DEACTIVATED: '注销账号',
  ADMIN_USER_CREATED: '管理员创建', ADMIN_USER_ENABLED: '管理员启用', ADMIN_USER_DISABLED: '管理员停用', ADMIN_ROLE_CHANGED: '管理员改角色', ADMIN_PASSWORD_RESET: '管理员重置密码', ADMIN_SESSIONS_REVOKED: '管理员退出会话', ADMIN_QUOTA_CHANGED: '管理员调整额度',
}
export function accountEventLabel(action: string): string {
  if (!action.startsWith('MANAGE_')) return eventLabels[action] || action
  const code = action.slice('MANAGE_'.length)
  const label = eventLabels[`ADMIN_${code}`] || eventLabels[code]
  return label ? `管理平台${label.replace(/^管理员/, '')}` : action
}
export const accountTime = (time: number | null | undefined) => time == null ? '暂无记录' : new Date(time).toLocaleString('zh-CN')
