import { request } from './api'
import { spawnPowWorker } from './proofOfWork'
import { createChallengeSolver, type PowChallenge, type PowProof } from '../domain/proofOfWork'
import type { EmailCodePurpose, EmailCooldown } from '../domain/emailAccount'

/**
 * 邮箱验证码、找回密码与绑定（smart-closet-server docs/design/2026-11-24-邮件模块：邮箱注册、找回密码与监控告警设计.md 4.4 节）。
 * 邮件关闭时这些接口都是 404 EMAIL_DISABLED，界面不会调用它们（入口不显示）；演示模式同样视为邮件关闭。
 * 没登录时取码（注册、找回）要先过工作量证明；已登录绑定用当前密码确认，不需要题目。
 */
export * from '../domain/emailAccount'
export type { PowProof } from '../domain/proofOfWork'

export type EmailView = { emailBound: boolean; emailMasked: string | null }

const post = <T>(path: string, body: unknown, method = 'POST') => request<T>(path, { method, body: JSON.stringify(body) })

export const emailApi = {
  challenge: () => request<PowChallenge>('/api/auth/email-code/challenge'),
  /** 注册填邮箱，找回填用户名或邮箱；不论账号是否存在，响应都一样。 */
  requestCode: (purpose: EmailCodePurpose, target: string, proof: PowProof) => post<EmailCooldown>('/api/auth/email-code', purpose === 'REGISTER'
    ? { purpose, email: target.trim(), ...proof }
    : { purpose, login: target.trim(), ...proof }),
  /** 成功后全部设备退出，不会自动登录。 */
  resetPassword: (login: string, code: string, newPassword: string) => post<void>('/api/auth/password-reset', { login: login.trim(), code, newPassword }),
  requestBindCode: (email: string, currentPassword: string) => post<EmailCooldown>('/api/auth/email/code', { email: email.trim(), currentPassword }),
  bind: (email: string, code: string) => post<EmailView>('/api/auth/email', { email: email.trim(), code }, 'PUT'),
  unbind: (currentPassword: string) => post<EmailView>('/api/auth/email', { currentPassword }, 'DELETE'),
}

/** 取码用的安全校验；页面打开就开始算，点“获取验证码”时通常已经算完。 */
export function createEmailProofOfWork(spawn: () => Worker = spawnPowWorker) {
  return createChallengeSolver(() => emailApi.challenge(), spawn, '这个浏览器没法完成安全校验，换个浏览器再试试。')
}
