// 整理中（ToC 改版 P4）：一件草稿现在处在哪一步。与“整理中”页（原未入柜）的“处理中 / 需处理 / 待核对”同一套判断，只换成用户的话。
import { isProcessing } from '../domain/workflow.ts'

type Draft = { taskStatus?: string | null; imageProcessing?: { stickerRequired?: boolean; stickerReady?: boolean } | null }
export type SortingState = 'processing' | 'review' | 'failed' | 'ready'

export function sortingState(item: Draft): SortingState {
  if (isProcessing(item.taskStatus ?? undefined)) return 'processing'
  if (['FAILED', 'UNKNOWN', 'CANCELLED'].includes(item.taskStatus || '')) return 'failed'
  if (item.taskStatus === 'NEEDS_REVIEW' || (item.imageProcessing?.stickerRequired && !item.imageProcessing.stickerReady)) return 'review'
  return 'ready'
}
