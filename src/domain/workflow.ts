import type { ClosetTask, Garment } from '../services/api'

export const isProcessing = (status?: string) => ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(status || '')
export const taskLabels: Record<ClosetTask['status'], string> = {
  QUEUED: '等待处理', RUNNING: '正在处理', CANCEL_REQUESTED: '正在取消', SUCCEEDED: '处理结束',
  NEEDS_REVIEW: '结果需检查', FAILED: '处理失败', CANCELLED: '已取消', UNKNOWN: '状态待核实',
}
export const imageLabels: Record<string, string> = { INPUT: '上传原图', GENERATED: 'AI 整理图', GENERATE: 'AI 整理图', SEGMENT: '透明抠图', ENSURE_TRANSPARENCY: '透明图片', CUTOUT: '透明抠图', STICKER: '贴纸展示图', TRANSPARENT: '透明图片', ORIGINAL: '上传原图' }
export const blocksConfirmation = (assessment?: string) => ['NO_GARMENT', 'MULTIPLE_GARMENTS', 'UNUSABLE'].includes(assessment || '')
export function processingSeconds(task: ClosetTask, now = Date.now()) {
  const finished = [...task.steps, ...(task.attempts || [])].map(step => Date.parse(step.finishedAt || '')).filter(Number.isFinite)
  const end = isProcessing(task.status) ? now : finished.length ? Math.max(...finished) : Date.parse(task.updatedAt || task.createdAt)
  return Math.max(0, Math.floor((end - Date.parse(task.createdAt)) / 1000))
}
export function generatedImages(task: ClosetTask | null) {
  return (task?.assets || []).filter(asset => ['GENERATE', 'GENERATED', 'SEGMENT', 'CUTOUT', 'ENSURE_TRANSPARENCY', 'TRANSPARENT', 'STICKER'].includes(asset.kind) && asset.url !== task?.inputUrl)
}
export function workflowSummary(garment: Pick<Garment, 'taskStatus' | 'status' | 'assessment'>, task?: ClosetTask | null) {
  const state = task?.status || garment.taskStatus
  if (garment.status === 'TRASHED') return { title: '已移入回收站', description: '图片与处理记录已保留，可以恢复。', tone: 'neutral' }
  if (state === 'CANCEL_REQUESTED') return { title: '正在取消处理', description: '等待服务端终止任务，原图和已产生的结果会保留。', tone: 'processing' }
  if (state === 'QUEUED') return { title: '照片已保存，等待处理', description: '任务在服务端排队。你可以离开页面或继续添加衣物。', tone: 'processing' }
  if (state === 'RUNNING') {
    const current = task?.steps.find(step => step.status === 'running')
    return { title: current ? `正在${current.name.replace(/^AI /, '')}` : '正在处理衣物', description: '页面根据服务端状态更新，结果返回后会显示在下方。', tone: 'processing' }
  }
  if (blocksConfirmation(garment.assessment)) return { title: '这张照片需要重新上传', description: '识别发现多件衣物、没有衣物或图片不可用，请重新拍摄单件衣物。', tone: 'error' }
  if (garment.status === 'ACTIVE') return { title: '已确认入柜', description: '你选择的图片和衣物信息已保存到衣柜。', tone: 'success' }
  if (state === 'FAILED') return { title: '处理失败，原图已保留', description: '查看失败原因后可以主动重试，也可以选择原图并手动填写信息入柜。', tone: 'error' }
  if (state === 'UNKNOWN') return { title: '处理结果待核实', description: '服务端无法确认上游调用结果，不会自动再次调用 AI。你可以核对现有图片。', tone: 'warning' }
  if (state === 'CANCELLED') return { title: '处理已取消，原图已保留', description: '可以使用原图入柜，或主动重新提交处理。', tone: 'neutral' }
  if (state === 'NEEDS_REVIEW') return { title: '结果需要检查，尚未入柜', description: '检查图片和服务端提示，选好展示图后确认入柜。', tone: 'warning' }
  return { title: '请核对结果，尚未入柜', description: task?.mode === '仅识别' ? '本次只识别信息，展示图片保留原图。核对后确认入柜。' : '选择一张展示图，核对衣物信息，然后确认入柜。', tone: 'neutral' }
}
