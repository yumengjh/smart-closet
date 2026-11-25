// 邮箱注册、找回密码与绑定的纯规则（smart-closet-server docs/design/2026-11-24-邮件模块：邮箱注册、找回密码与监控告警设计.md 4.6 节）。
// 邮件关闭时服务端不返回 emailRequired / emailBound，界面据此不显示任何邮箱入口。邮箱与验证码不进埋点。
import { ApiError } from './apiError.ts'
import type { PowProof, ProofOfWork } from './proofOfWork.ts'

export type EmailCodePurpose = 'REGISTER' | 'RESET'
export type EmailCooldown = { cooldownSeconds: number }
/** 账号与安全里“邮箱”一行；null 表示邮件没开，不显示。 */
export type EmailStatus = { bound: boolean; masked: string | null }

export const EMAIL_CODE_LENGTH = 6
export const EMAIL_MAX_LENGTH = 254

/** /api/auth/registration：邮件开启时才有 emailRequired。 */
export const mailEnabled = (registration: { emailRequired?: unknown } | null | undefined) => typeof registration?.emailRequired === 'boolean'
/** 只有邮件开启且站点要求时，注册第一步才加邮箱与验证码。 */
export const emailRequired = (registration: { emailRequired?: unknown } | null | undefined) => registration?.emailRequired === true

/** /api/auth/me 或 PUT/DELETE /email 的响应：邮件开启时才有 emailBound。 */
export function emailStatus(view: { emailBound?: unknown; emailMasked?: unknown } | null | undefined): EmailStatus | null {
  if (typeof view?.emailBound !== 'boolean') return null
  return { bound: view.emailBound, masked: view.emailBound && typeof view.emailMasked === 'string' ? view.emailMasked : null }
}

/** 粗查一遍格式，细则以服务端为准。 */
export function emailProblem(email: string): string {
  const value = email.trim()
  if (!value) return '请填写邮箱。'
  if (value.length > EMAIL_MAX_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return '邮箱格式不正确。'
  return ''
}
export function codeProblem(code: string): string {
  if (!code) return '请填写验证码。'
  return /^\d{6}$/.test(code) ? '' : '验证码是 6 位数字。'
}
/** 粘贴“123 456”或带全角数字时只留 6 位半角数字。 */
export function normalizeCode(input: string): string {
  return input.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH)
}

/** 取码失败：给界面的话，以及要等多久才能再点（秒，没有就是 0）。 */
export function emailCodeFailure(cause: unknown): { message: string; waitSeconds: number } {
  if (cause instanceof ApiError) {
    const wait = retryAfterSeconds(cause)
    switch (cause.code) {
      case 'EMAIL_CODE_THROTTLED': return { message: '请求太频繁，请稍后再试。', waitSeconds: wait }
      case 'LOGIN_THROTTLED': return { message: '密码验证次数过多，请稍后再试。', waitSeconds: wait }
      case 'EMAIL_CHALLENGE_INVALID': return { message: '安全校验没有通过，请再点一次发送。', waitSeconds: 0 }
      case 'EMAIL_DISABLED': return { message: '邮件功能暂时没有开启。', waitSeconds: 0 }
      default: return { message: cause.message, waitSeconds: wait }
    }
  }
  return { message: cause instanceof Error ? cause.message : '验证码没发出去，请稍后再试。', waitSeconds: 0 }
}
export const isChallengeInvalid = (cause: unknown) => cause instanceof ApiError && cause.code === 'EMAIL_CHALLENGE_INVALID'

/** Retry-After 头（秒）；只在 429 时用。 */
export function retryAfterSeconds(cause: ApiError): number {
  if (cause.status !== 429 || !cause.retryAfter) return 0
  const seconds = Number(cause.retryAfter)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0
}

/** 倒计时文字：一分钟内按秒，再长按分钟、小时。 */
export function waitLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} 分钟`
  return `${Math.ceil(seconds / 3600)} 小时`
}
export function codeButtonLabel(state: { sending: boolean; waitSeconds: number; sent: boolean }): string {
  if (state.sending) return '发送中'
  if (state.waitSeconds > 0) return `${waitLabel(state.waitSeconds)}后重发`
  return state.sent ? '重新获取' : '获取验证码'
}

/** 注册提交被拒时回到哪一步：邮箱、验证码与账号在第一步，密码在第二步，其余留在原地（-1）。 */
export function registerErrorStep(cause: unknown): number {
  const code = cause instanceof ApiError ? cause.code ?? '' : ''
  const message = cause instanceof Error ? cause.message : ''
  if (code.startsWith('EMAIL_') || /用户名|账号|邀请|邮箱|验证码/.test(message)) return 0
  if (/密码/.test(message)) return 1
  return -1
}

/**
 * 带安全校验地取一次码：用已算好的题；题目过期或用过（EMAIL_CHALLENGE_INVALID）就换一道新题自动再发一次。
 * 题目一次性，不论成败都在后台预备下一道，给“重新获取”用。
 */
export async function sendWithProof<T>(send: (proof: PowProof) => Promise<T>, proof: ProofOfWork): Promise<T> {
  try {
    try { return await send(await proof.ready()) }
    catch (cause) { if (!isChallengeInvalid(cause)) throw cause; return await send(await proof.prepare()) }
  } finally { void proof.prepare().catch(() => { /* 下次点发送时再算 */ }) }
}
