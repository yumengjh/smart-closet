import type { ClosetTask, Garment } from '../services/api'

export const isProcessing = (status?: string) => ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(status || '')
export const taskLabels: Record<ClosetTask['status'], string> = {
  QUEUED: '等待处理', RUNNING: '正在处理', CANCEL_REQUESTED: '正在取消', SUCCEEDED: '处理结束',
  NEEDS_REVIEW: '结果需检查', FAILED: '处理失败', CANCELLED: '已取消', UNKNOWN: '状态待核实',
}
export const imageLabels: Record<string, string> = { INPUT: '上传原图', BASE: '基础图', BASE_STICKER: '基础贴纸', AI_ENHANCED: 'AI 增强图', GENERATED: 'AI 整理图', GENERATE: 'AI 整理图', SEGMENT: '透明抠图', ENSURE_TRANSPARENCY: '背景检查图', CUTOUT: '透明抠图', STICKER: '贴纸展示图', TRANSPARENT: '透明图片', ORIGINAL: '上传原图' }
export const blocksConfirmation = (assessment?: string) => ['NO_GARMENT', 'MULTIPLE_GARMENTS', 'UNUSABLE'].includes(assessment || '')
export function processingSeconds(task: ClosetTask, now = Date.now()) {
  const finished = [...task.steps, ...(task.attempts || [])].map(step => Date.parse(step.finishedAt || '')).filter(Number.isFinite)
  const end = isProcessing(task.status) ? now : finished.length ? Math.max(...finished) : Date.parse(task.updatedAt || task.createdAt)
  return Math.max(0, Math.floor((end - Date.parse(task.createdAt)) / 1000))
}
export function generatedImages(task: ClosetTask | null) {
  return (task?.assets || []).filter(asset => ['BASE', 'BASE_STICKER', 'AI_ENHANCED', 'GENERATE', 'GENERATED', 'SEGMENT', 'CUTOUT', 'ENSURE_TRANSPARENCY', 'TRANSPARENT', 'STICKER'].includes(asset.kind) && asset.url !== task?.inputUrl).sort((a, b) => (task?.steps?.findIndex(step => step.outputUrl === a.url) ?? -1) - (task?.steps?.findIndex(step => step.outputUrl === b.url) ?? -1))
}
/** In-flight work comes first; finished image jobs must not hide newer recognition. */
export function orderedTasks(...tasks: (ClosetTask | null | undefined)[]) {
  return tasks.filter((task): task is ClosetTask => Boolean(task)).filter((task, index, all) => all.findIndex(other => other.id === task.id) === index)
    .sort((a, b) => Number(isProcessing(b.status)) - Number(isProcessing(a.status)) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
}
export function workflowSummary(garment: Pick<Garment, 'taskStatus' | 'status' | 'assessment' | 'imageProcessing'>, task?: ClosetTask | null) {
  const state = task?.status || garment.taskStatus
  if (garment.status === 'TRASHED') return { title: '已移入回收站', description: '图片与处理记录已保留，可以恢复。', tone: 'neutral' }
  if (state === 'CANCEL_REQUESTED') return { title: '正在取消处理', description: '等待服务端终止任务，原图和已产生的结果会保留。', tone: 'processing' }
  if (state === 'QUEUED') return { title: '照片已保存，等待处理', description: '任务在服务端排队。你可以离开页面或继续添加衣物。', tone: 'processing' }
  if (state === 'RUNNING') {
    const current = task?.steps.find(step => step.status === 'running')
    return { title: current ? `正在${current.name.replace(/^AI /, '')}` : '正在处理衣物', description: '页面根据服务端状态更新，结果返回后会显示在下方。', tone: 'processing' }
  }
  const recognition = [...(task?.steps || [])].reverse().find(step => step.recognition)?.recognition
  if (blocksConfirmation(recognition?.assessment)) return { title: '本次识别需要补充目标说明', description: recognition?.issues?.[0]?.message || task?.note || '未能确定本次衣物。可以说明要识别哪件，或说明实物是否为一件连衣裙，再主动识别。', tone: 'warning' }
  if (task && ['FAILED', 'UNKNOWN', 'NEEDS_REVIEW'].includes(state || '') && (task.note || task.steps?.some(step => step.error)))
    return { title: garment.status === 'ACTIVE' ? '衣物已入柜，本次处理需查看' : '本次处理需要查看', description: task.steps?.find(step => step.error)?.error || task.note || '请查看本次处理记录。', tone: 'warning' }
  if (blocksConfirmation(garment.assessment)) return { title: '这张照片需要重新上传', description: '识别发现多件衣物、没有衣物或图片不可用，请重新拍摄单件衣物。', tone: 'error' }
  if (garment.imageProcessing?.stickerRequired && !garment.imageProcessing.stickerReady)
    return { title: garment.status === 'ACTIVE' ? '已入柜，贴纸尚未完成' : '贴纸尚未完成，等待继续处理', description: '当前图片是中间结果。请继续本地抠图或核对透明背景后制作贴纸；完成后再选择展示图。', tone: 'warning' }
  if (garment.imageProcessing?.stickerReady && garment.status === 'DRAFT') return { title: '贴纸已完成，请核对结果', description: '最终贴纸已显示。选择展示图、核对信息后确认入柜。', tone: 'success' }
  if (garment.status === 'ACTIVE') return { title: '已确认入柜', description: '你选择的图片和衣物信息已保存到衣柜。', tone: 'success' }
  if (state === 'FAILED') return { title: '处理失败，原图已保留', description: '查看失败原因后可以主动重试，也可以选择原图并手动填写信息入柜。', tone: 'error' }
  if (state === 'UNKNOWN') return { title: '处理结果待核实', description: '服务端无法确认上游调用结果，不会自动再次调用 AI。你可以核对现有图片。', tone: 'warning' }
  if (state === 'CANCELLED') return { title: '处理已取消，原图已保留', description: '可以使用原图入柜，或主动重新提交处理。', tone: 'neutral' }
  if (state === 'NEEDS_REVIEW') return { title: '结果需要检查，尚未入柜', description: '检查图片和服务端提示，选好展示图后确认入柜。', tone: 'warning' }
  return { title: '请核对结果，尚未入柜', description: task?.mode === '仅识别' ? '本次只识别信息，展示图片保留原图。核对后确认入柜。' : '选择一张展示图，核对衣物信息，然后确认入柜。', tone: 'neutral' }
}
