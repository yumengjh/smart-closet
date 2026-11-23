// 意见反馈的纯规则（与服务端 FeedbackService 同一口径），不依赖浏览器与请求，便于单测。
export type FeedbackCategory = 'PROBLEM' | 'IDEA' | 'OTHER'
export type FeedbackStatus = 'NEW' | 'PROCESSING' | 'RESOLVED' | 'CLOSED'
export type FeedbackOptions = { enabled: boolean; anonymousEnabled: boolean; signedIn: boolean; maxLength: number }
export type FeedbackChallenge = { token: string; difficulty: number; minWaitMs: number }
export type FeedbackReceipt = { id: string | null; status: FeedbackStatus; submitter: 'ACCOUNT' | 'HIDDEN' | 'ANONYMOUS'; duplicate: boolean }
export type MyFeedback = { id: string; category: FeedbackCategory; content: string; status: FeedbackStatus; reply: string | null; repliedAtMs: number | null; createdAtMs: number; updatedAtMs: number }
export type MyFeedbackPage = { items: MyFeedback[]; page: number; size: number; total: number }
export type FeedbackDraft = { category: FeedbackCategory; content: string; contact?: string; page?: string; attachAccount: boolean }

export const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'PROBLEM', label: '遇到问题' }, { value: 'IDEA', label: '想要的功能' }, { value: 'OTHER', label: '其他' },
]
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = { NEW: '已收到', PROCESSING: '处理中', RESOLVED: '已解决', CLOSED: '已关闭' }
export const FEEDBACK_MIN = 5

/** 所在页面只收路由模板（如 /garment/:id），不合规就不带。 */
export function feedbackPage(from: unknown): string | undefined {
  return typeof from === 'string' && /^\/[A-Za-z0-9/:_.-]{0,99}$/.test(from) ? from : undefined
}
export function feedbackPlatform(): 'MOBILE' | 'DESKTOP' | 'PWA' {
  if (typeof window === 'undefined') return 'DESKTOP'
  if (window.matchMedia?.('(display-mode: standalone)').matches) return 'PWA'
  return window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 1024 ? 'MOBILE' : 'DESKTOP'
}
/** 字数按字符（code point）算，与服务端一致。 */
export const feedbackLength = (text: string) => Array.from(text.trim()).length
export const countLinks = (text: string) => (text.match(/https?:\/\/|www\./gi) ?? []).length

