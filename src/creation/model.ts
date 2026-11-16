import type { CreationInput, CreationJob, CreationTemplate, Light, PendingCreation } from './types'
import type { PoseChoice } from '../services/platform'

export function creationInput(template: CreationTemplate, garments: { id: string; revision: number }[], person: { id: string; revision: number } | undefined, light: Light, pose: PoseChoice, note: string, source?: { id: string; revision: number }, parentJobId?: string): CreationInput {
  if (!template.available) throw new Error(template.unavailableReason || '这个效果暂时不可用，请换一个。')
  const unique = [...new Map(garments.map(item => [item.id, { id: item.id, revision: item.revision }])).values()]
  if (!unique.length) throw new Error('先选几件衣物。')
  if (unique.length > Math.min(12, template.maxGarments)) throw new Error(`这个效果最多选择 ${Math.min(12, template.maxGarments)} 件衣物。`)
  if (template.personRequired && !person) throw new Error('请先选择已确认的形象。')
  if (note.trim().length > 200) throw new Error('补充说明最多 200 字。')
  return {
    templateId: template.id, templateVersion: template.version, garments: unique,
    ...(source ? { outfitId: source.id, outfitRevision: source.revision } : {}),
    ...(template.personRequired ? { baselineId: person!.id, baselineRevision: person!.revision, pose } : {}),
    options: { light: template.options.light?.includes(light) ? light : 'DEFAULT' },
    ...(note.trim() ? { note: note.trim() } : {}), ...(parentJobId ? { parentJobId } : {}),
  }
}
export const liveCreation = (job: Pick<CreationJob, 'status' | 'waitReason'>) => job.waitReason !== 'FEATURE_DISABLED' && ['QUEUED', 'WAITING_RESOURCE', 'RUNNING'].includes(job.status)
export function creationStatus(job: Pick<CreationJob, 'status' | 'waitReason'>) {
  if (job.status === 'QUEUED' && job.waitReason === 'FEATURE_DISABLED') return '等待功能恢复'
  return { QUEUED: '等待生成', WAITING_RESOURCE: '等待生成', RUNNING: '正在创作', SUCCEEDED: '作品已完成', FAILED: '生成未完成', UNKNOWN: '结果待确认', CANCELLED: '已取消', DELETED: '已删除' }[job.status] || '状态待确认'
}
export function readPendingCreation(value: string | null): PendingCreation | null {
  try { const data = JSON.parse(value || 'null'); return data && typeof data.key === 'string' && data.key.length > 0 && typeof data.preparationId === 'string' && data.preparationId.length > 0 ? { key: data.key, preparationId: data.preparationId } : null } catch { return null }
}
