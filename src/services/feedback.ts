import { ApiError } from '../domain/apiError'
import { request, usingMocks } from './api'
import { webBuild } from './version'

/**
 * 意见反馈（smart-closet-server docs/design/2026-11-23-用户反馈：匿名提交与后台处理设计.md）。身份只由服务端会话决定；
 * 没登录时先拿一道工作量证明题，在 Worker 里算完再提交。不报 IP、UA，也不附截图。
 */
export * from '../domain/feedback'
import type { FeedbackDraft, FeedbackReceipt, FeedbackOptions, FeedbackChallenge, MyFeedback, MyFeedbackPage } from '../domain/feedback'
import { feedbackPlatform } from '../domain/feedback'
import { createChallengeSolver } from '../domain/proofOfWork'
import { spawnPowWorker } from './proofOfWork'

const mockMine: MyFeedback[] = []

export const feedbackApi = {
  options: (): Promise<FeedbackOptions> => usingMocks
    ? Promise.resolve({ enabled: true, anonymousEnabled: true, signedIn: true, maxLength: 1000 })
    : request<FeedbackOptions>('/api/feedback/options'),
  challenge: () => request<FeedbackChallenge>('/api/feedback/challenge'),
  mine: (page = 1, size = 20): Promise<MyFeedbackPage> => usingMocks
    ? Promise.resolve({ items: [...mockMine], page: 1, size, total: mockMine.length })
    : request<MyFeedbackPage>(`/api/feedback/mine?page=${page}&size=${size}`),
  submit: async (draft: FeedbackDraft, proof?: { challenge: string; nonce: string }): Promise<FeedbackReceipt> => {
    if (usingMocks) {
      const now = Date.now()
      const id = draft.attachAccount ? `mock-${now}` : null
      if (id) mockMine.unshift({ id, category: draft.category, content: draft.content.trim(), status: 'NEW', reply: null, repliedAtMs: null, createdAtMs: now, updatedAtMs: now })
      return { id, status: 'NEW', submitter: draft.attachAccount ? 'ACCOUNT' : 'HIDDEN', duplicate: false }
    }
    const body = { ...draft, content: draft.content.trim(), contact: draft.contact?.trim() || undefined, platform: feedbackPlatform(), webVersion: webBuild.version, ...proof }
    return request<FeedbackReceipt>('/api/feedback', { method: 'POST', body: JSON.stringify(body) })
  },
}

/**
 * 没登录时的安全校验：拿题、在 Worker 里算、等够最短时间。页面打开就开始，用户写完时通常已经算完。
 * 每次 prepare() 都换一道新题；cancel() 停掉正在算的那道。
 */
export function createProofOfWork(spawn: () => Worker = spawnPowWorker) {
  return createChallengeSolver(() => feedbackApi.challenge(), spawn, '这个浏览器没法完成安全校验，请登录后再反馈。')
}

export function feedbackError(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === 'FEEDBACK_RATE_LIMITED') return '提交得有点频繁，稍后再试。'
    if (cause.code === 'FEEDBACK_ANONYMOUS_CLOSED') return '现在要登录后才能反馈。'
    return cause.message
  }
  return cause instanceof Error ? cause.message : '没发出去，请稍后再试。'
}
