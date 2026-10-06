import { request } from './api'
export type ExecutionTask = { id: string; businessId: string; kind: string; stage: number; owner: string; pool: string; account?: string; status: string; waitReason?: string; error?: string }
export type Limits = { cpu: number; recognition: number; generation: number; accountConcurrency: number; assistantReserved: number; rpm: number | null; paused: string[] }
export type AdminProcessing = { items: ExecutionTask[]; resources: { config: { limits: Limits; revision: number }; running: Record<string, number>; counts: Record<string, string | number>[]; accounts: Record<string, string | number>[] } }
export const processingApi = {
 list: (page = 1) => request<{ items: ExecutionTask[] }>(`/api/processing/tasks?page=${page}`),
 cancel: (id: string) => request<ExecutionTask>(`/api/processing/tasks/${id}/cancel`, { method: 'POST' }),
 retry: (id: string) => request<ExecutionTask>(`/api/processing/tasks/${id}/retry`, { method: 'POST' }),
 admin: (page = 1) => request<AdminProcessing>(`/api/admin/processing?page=${page}`),
 config: (limits: Limits, revision: number) => request('/api/admin/processing/config', { method: 'PUT', body: JSON.stringify({ limits, revision }) }),
}
export const poolLabels: Record<string, string> = { CPU: '本地图片处理', RECOGNITION: '资料识别', GENERATION: '图片增强' }
export const executionLabels: Record<string, string> = { QUEUED: '排队', WAITING_QUOTA: '等待额度', RUNNING: '处理中', CANCEL_REQUESTED: '正在取消', CANCELLED: '已取消', SUCCEEDED: '完成', SKIPPED: '跳过', FAILED: '失败', UNKNOWN: '结果不确定' }
