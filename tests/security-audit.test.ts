import test from 'node:test'
import assert from 'node:assert/strict'
import { auditResultColor, auditResultLabel, auditSubjectLabel, auditTypeLabel, auditTypeOptions, integritySummary } from '../src/domain/securityAudit.ts'
import { accountEventLabel } from '../src/domain/account.ts'

test('login failure subjects show only a short digest and never pretend to be a user name', () => {
  assert.equal(auditSubjectLabel('~0123456789abcdef'), '登录名摘要 ~012345…')
  assert.equal(auditSubjectLabel('alice'), 'alice')
  assert.equal(auditSubjectLabel('-'), '—')
  assert.equal(auditSubjectLabel('~not-a-digest'), '~not-a-digest')
})
test('event types and results are labelled in Chinese and unknown ones pass through', () => {
  assert.equal(auditTypeLabel('LOGIN_FAILED'), '登录失败')
  assert.equal(auditTypeLabel('ACCESS_DENIED'), '越权访问被拒')
  assert.equal(auditTypeLabel('USER_DISABLED'), 'USER_DISABLED')
  assert.equal(auditResultLabel('OK'), '成功')
  assert.equal(auditResultLabel('UNKNOWN'), '未知')
  assert.equal(auditResultLabel(null), '')
  assert.equal(auditResultColor('FAILED'), 'red')
  assert.equal(auditResultColor('UNKNOWN'), 'orange')
})
test('type options follow the chosen category and management operation names are not preset', () => {
  const catalog = { AUTH: ['LOGIN_FAILED', 'LOGIN_LOCKED'], MODEL: ['MODEL_CALL'], MANAGEMENT: ['(管理接口写操作，类型即操作名)'] }
  assert.deepEqual(auditTypeOptions(catalog, 'AUTH').map(o => o.value), ['LOGIN_FAILED', 'LOGIN_LOCKED'])
  assert.deepEqual(auditTypeOptions(catalog, 'MANAGEMENT'), [])
  assert.deepEqual(auditTypeOptions(catalog, undefined).map(o => o.value), ['LOGIN_FAILED', 'LOGIN_LOCKED', 'MODEL_CALL'])
  assert.deepEqual(auditTypeOptions(undefined, 'AUTH'), [])
})
test('the account event drawer also labels the new security events', () => {
  assert.equal(accountEventLabel('LOGIN_LOCKED'), '登录被锁定')
  assert.equal(accountEventLabel('INVITE_USED'), '使用邀请码')
})
test('the integrity summary says complete, or names the first changed day', () => {
  const base = { verifiedDays: 30, expiredDays: 0, unsealedDays: 0, problems: [] as { day: string; kind: string }[] }
  assert.equal(integritySummary({ ...base, status: 'INTACT' }), '审计记录完整：已核对 30 天的记录。')
  assert.match(integritySummary({ ...base, status: 'INTACT', expiredDays: 5, unsealedDays: 1 }), /5 天记录已过保留期.*1 天尚未封存/)
  assert.equal(integritySummary({ ...base, status: 'TAMPERED', problems: [{ day: '2026-10-01', kind: 'ROWS_MODIFIED' }, { day: '2026-10-02', kind: 'CHAIN_BROKEN' }] }), '发现异常：2026-10-01 记录被改动或删除，另有 1 处。')
  assert.match(integritySummary({ ...base, status: 'EMPTY' }), /还没有已封存/)
  assert.equal(auditResultLabel('CANCELLED'), '已中止')
})
