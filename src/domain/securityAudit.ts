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
  AGENT_COMMAND: '助手操作', AUDIT_EXPORTED: '导出审计记录', MODEL_CALL: '模型调用', MODEL_ATTEMPT: '生成尝试',
}
const resultLabels: Record<string, string> = { OK: '成功', UNKNOWN: '未知', SUCCESS: '成功', FAILURE: '失败', SUCCEEDED: '成功', FAILED: '失败', CANCELLED: '已中止', DISPATCHING: '进行中' }
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

export const integrityProblemLabels: Record<string, string> = { ROWS_MODIFIED: '记录被改动或删除', CHAIN_BROKEN: '摘要缺失或前后对不上', DIGEST_ALTERED: '摘要记录被改动' }
/** 校验结果的一句话：完整，或第一处被改动的日期。 */
export function integritySummary(report: { status: string; verifiedDays: number; expiredDays: number; unsealedDays: number; problems: { day: string; kind: string }[] }): string {
  if (report.status === 'EMPTY') return '还没有已封存的日期：审计摘要在每天凌晨封存前一天的记录，明天再来校验。'
  if (report.status === 'TAMPERED') {
    const first = report.problems[0]
    return `发现异常：${first.day} ${integrityProblemLabels[first.kind] || first.kind}${report.problems.length > 1 ? `，另有 ${report.problems.length - 1} 处` : ''}。`
  }
  return `审计记录完整：已核对 ${report.verifiedDays} 天的记录${report.expiredDays ? `，另有 ${report.expiredDays} 天记录已过保留期、只核对摘要链` : ''}${report.unsealedDays ? `；最近 ${report.unsealedDays} 天尚未封存` : ''}。`
}
