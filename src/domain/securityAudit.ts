export const auditCategoryLabels: Record<string, string> = {
  AUTH: '登录与注册', ACCESS: '越权与安全校验', ACCOUNT: '账号与管理员操作', INVITE: '邀请码', ASSISTANT: '助手危险操作', MANAGEMENT: '管理接口操作', MODEL: '模型调用',
}
export const auditCategoryColors: Record<string, string> = {
  AUTH: 'blue', ACCESS: 'red', ACCOUNT: 'default', INVITE: 'purple', ASSISTANT: 'orange', MANAGEMENT: 'geekblue', MODEL: 'cyan',
}
const typeLabels: Record<string, string> = {
  LOGIN_SUCCEEDED: '登录成功', LOGIN_FAILED: '登录失败', LOGIN_LOCKED: '登录被锁定', PORTABLE_LOGIN_FAILED: '便携登录失败', PASSWORD_CONFIRM_FAILED: '当前密码输错',
  REGISTERED: '注册', PASSWORD_CHANGED: '修改密码', PROFILE_UPDATED: '修改资料', SESSIONS_REVOKED: '退出其他设备', DEACTIVATED: '注销账号',
  ADMIN_USER_CREATED: '管理员创建用户', ADMIN_USER_ENABLED: '管理员启用用户', ADMIN_USER_DISABLED: '管理员停用用户', ADMIN_ROLE_CHANGED: '管理员改角色',
  ADMIN_PASSWORD_RESET: '管理员重置密码', ADMIN_SESSIONS_REVOKED: '管理员退出会话', ADMIN_QUOTA_CHANGED: '管理员调整额度',
  ACCESS_DENIED: '越权访问被拒', CSRF_REJECTED: '安全校验失败', MANAGE_AUTH_REJECTED: '管理接口签名被拒',
  INVITE_CREATED: '创建邀请码', INVITE_REVOKED: '撤销邀请码', INVITE_USED: '使用邀请码', INVITE_REJECTED: '邀请码无效',
  AGENT_COMMAND: '助手操作', MODEL_CALL: '模型调用', MODEL_ATTEMPT: '生成尝试',
}
const resultLabels: Record<string, string> = { OK: '成功', UNKNOWN: '未知', SUCCESS: '成功', FAILURE: '失败', SUCCEEDED: '成功', FAILED: '失败', DISPATCHING: '进行中' }
export const auditTypeLabel = (type: string) => typeLabels[type] || type
export const auditResultLabel = (result: string | null | undefined) => result ? resultLabels[result] || result : ''
/** 登录失败的 subject 是登录名的单向摘要（~ 加 16 位十六进制），只显示短形式，不尝试还原。 */
export const auditSubjectLabel = (subject: string) => subject === '-' ? '—' : /^~[0-9a-f]{16}$/.test(subject) ? `登录名摘要 ${subject.slice(0, 7)}…` : subject
export const auditResultColor = (result: string | null | undefined) => result === 'OK' || result === 'SUCCESS' || result === 'SUCCEEDED' ? 'green' : result === 'FAILED' || result === 'FAILURE' ? 'red' : result === 'UNKNOWN' ? 'orange' : 'default'
/** 事件类型下拉：分类选中后只列该分类的类型，MANAGEMENT 的类型就是操作名，不预置。 */
export function auditTypeOptions(catalog: Record<string, string[]> | undefined, category: string | undefined): { value: string; label: string }[] {
  if (!catalog) return []
  const names = category ? (category === 'MANAGEMENT' ? [] : catalog[category] || []) : Object.entries(catalog).filter(([key]) => key !== 'MANAGEMENT').flatMap(([, list]) => list)
  return [...new Set(names)].map(value => ({ value, label: `${auditTypeLabel(value)}（${value}）` }))
}
