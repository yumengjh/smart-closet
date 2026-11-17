// “做张图”分步的纯逻辑（试穿与创作合并，server#271）：效果列表、步骤推导、能否前进、草稿读写、作品状态文案。页面只负责渲染。
import type { PoseChoice } from '../services/platform'
import type { CreationCatalog, CreationJob, CreationTemplate, Light } from './types'
import { creationStatus, liveCreation } from './model.ts'

export type StepKey = 'effect' | 'garments' | 'person'
export const stepTitles: Record<StepKey, string> = { effect: '选效果', garments: '选衣服', person: '谁来穿' }

/**
 * 上身图：效果列表里固定的第一张，前端内置，不归后台“创作效果”管理（不排序、不下架）。
 * 需要人物，衣服只能从已保存的搭配选（M3）；生成仍走 /api/ootd/*。编号带下划线，后台效果编号（小写字母数字与连字符）不会与它相同。
 */
export const OUTFIT_EFFECT_ID = '_outfit'
export const outfitEffect: CreationTemplate = { id: OUTFIT_EFFECT_ID, version: 0, name: '上身图', description: '穿在你的形象上', previewUrl: null, personRequired: true, options: {}, maxGarments: 12, available: true, unavailableReason: null }
export const isOutfitEffect = (template: Pick<CreationTemplate, 'id'> | undefined) => template?.id === OUTFIT_EFFECT_ID
/** 效果列表：上身图在前，其后是后台已上线的创作效果（按后台顺序）；创作关闭时只剩上身图。 */
export function effectsFor(catalog: CreationCatalog | null | undefined): CreationTemplate[] {
  return [outfitEffect, ...(catalog?.enabled ? catalog.templates.filter(item => item.id !== OUTFIT_EFFECT_ID) : [])]
}
/** 创作关闭或目录为空时只有上身图可选，跳过“选效果”这一步。 */
export const canChooseEffect = (catalog: CreationCatalog | null | undefined) => Boolean(catalog?.enabled && catalog.templates.some(item => item.id !== OUTFIT_EFFECT_ID))

/** 不需要人物的效果没有“谁来穿”；不能选效果时没有第一步。 */
export function stepsFor(template: Pick<CreationTemplate, 'personRequired'> | undefined, chooseEffect = true): StepKey[] {
  const steps: StepKey[] = template?.personRequired ? ['effect', 'garments', 'person'] : ['effect', 'garments']
  return chooseEffect ? steps : steps.filter(step => step !== 'effect')
}

export type StepState = {
  template: CreationTemplate | undefined; garmentCount: number; hasPerson: boolean
  /** 只对上身图有意义：是否已从已保存的搭配里选好一套。 */
  hasOutfit?: boolean
}
/** 当前步骤是否可以继续；不能时返回一句短原因。 */
export function stepBlock(step: StepKey, state: StepState): string {
  const { template } = state
  if (step === 'effect') return !template ? '先选一种效果' : !template.available ? template.unavailableReason || '这个效果暂不可用' : ''
  if (!template || !template.available) return '先选一种效果'
  if (isOutfitEffect(template)) {
    // 上身图不接受临时挑的衣服：有衣服但没有搭配时请用户先存成搭配，不自动保存。
    if (step === 'garments') return !state.hasOutfit ? state.garmentCount ? '先存成搭配' : '先选一套搭配' : state.garmentCount < 1 ? '这次至少穿一件' : ''
    return state.hasPerson ? '' : '先设置谁来穿'
  }
  const max = Math.min(12, template.maxGarments)
  if (step === 'garments') return state.garmentCount < 1 ? '先选几件衣服' : state.garmentCount > max ? `这个效果最多 ${max} 件` : ''
  return template.personRequired && !state.hasPerson ? '先选择已确认的形象' : ''
}
/** 全部步骤都满足时才能生成（返回第一处不满足的原因）。 */
export function generateBlock(state: StepState): string {
  for (const step of stepsFor(state.template)) { const reason = stepBlock(step, state); if (reason) return reason }
  return ''
}
/** 恢复草稿后落在哪一步：没有效果去选效果，没有衣服去选衣服，否则停在最后一步。 */
export function startStep(state: StepState): StepKey {
  if (!state.template || !state.template.available) return 'effect'
  const steps = stepsFor(state.template)
  for (const step of steps) if (stepBlock(step, state)) return step
  return steps[steps.length - 1]
}
/** 每次进入：能选效果时总从选效果开始（#257 90e56dd）；只有上身图时停在第一处没完成的步骤，带入了搭配就直接到“谁来穿”。 */
export function entryStep(steps: StepKey[], state: StepState): StepKey {
  if (steps[0] === 'effect') return 'effect'
  return steps.find(step => stepBlock(step, state)) || steps[steps.length - 1]
}
export const nextStep = (steps: StepKey[], step: StepKey): StepKey | undefined => steps[steps.indexOf(step) + 1]
export const prevStep = (steps: StepKey[], step: StepKey): StepKey | undefined => steps[steps.indexOf(step) - 1]

export type Draft = { ids: string[]; templateId: string; baselineId: string; light: Light; pose: PoseChoice; note: string; outfitId?: string }
export const emptyDraft = (): Draft => ({ ids: [], templateId: '', baselineId: '', light: 'DEFAULT', pose: { mode: 'AUTO' }, note: '' })
const lights = ['DEFAULT', 'WARM', 'COOL']
/** sessionStorage 里的草稿可能被损坏：逐字段校验，坏的字段回到默认值。 */
export function readDraft(value: string | null): Draft {
  const out = emptyDraft()
  let data: Record<string, unknown>
  try { const parsed = JSON.parse(value || 'null'); if (!parsed || typeof parsed !== 'object') return out; data = parsed } catch { return out }
  if (Array.isArray(data.ids)) out.ids = [...new Set(data.ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, 12)
  if (typeof data.templateId === 'string') out.templateId = data.templateId
  if (typeof data.baselineId === 'string') out.baselineId = data.baselineId
  if (typeof data.light === 'string' && lights.includes(data.light)) out.light = data.light as Light
  if (typeof data.note === 'string') out.note = data.note.slice(0, 200)
  if (typeof data.outfitId === 'string' && data.outfitId) out.outfitId = data.outfitId
  const pose = data.pose as { mode?: unknown; id?: unknown } | undefined
  if (pose?.mode === 'AUTO') out.pose = { mode: 'AUTO' }
  else if ((pose?.mode === 'PRESET' || pose?.mode === 'CUSTOM') && typeof pose.id === 'string' && pose.id) out.pose = { mode: pose.mode, id: pose.id }
  return out
}
export const serializeDraft = (draft: Draft): string => JSON.stringify(draft)

/** 作品卡上的状态：短标题 + 一句话，tone 决定颜色。 */
export type WorkTone = 'live' | 'done' | 'failed' | 'unsure' | 'idle'
export function workState(job: Pick<CreationJob, 'status' | 'waitReason' | 'errorMessage' | 'canRecreate'>): { label: string; detail: string; tone: WorkTone } {
  if (job.status === 'SUCCEEDED') return { label: '已完成', detail: '', tone: 'done' }
  if (job.status === 'QUEUED' && job.waitReason === 'FEATURE_DISABLED') return { label: '等待恢复', detail: '暂未开放，还没开始，不会用次数', tone: 'idle' }
  if (liveCreation(job)) return job.status === 'RUNNING' ? { label: '创作中', detail: '离开页面也会继续', tone: 'live' } : { label: '等待中', detail: '马上开始', tone: 'live' }
  if (job.status === 'UNKNOWN') return { label: '等你确认', detail: '结果待确认，暂不会自动重做', tone: 'unsure' }
  if (job.status === 'FAILED') return { label: '没做成', detail: (job.errorMessage || '').trim().slice(0, 40) || '换个方式再试一次', tone: 'failed' }
  return { label: creationStatus(job), detail: '', tone: 'idle' }
}
export const liveCount = (jobs: Pick<CreationJob, 'status' | 'waitReason'>[]) => jobs.filter(liveCreation).length

/** 对比两次轮询：之前见过且处于进行中、现在变为 SUCCEEDED 的作品，各只返回一次。 */
export function newlyDone(previous: Map<string, string>, jobs: Pick<CreationJob, 'id' | 'status' | 'waitReason'>[], celebrated: Set<string>): string[] {
  const done: string[] = []
  for (const job of jobs) {
    const before = previous.get(job.id)
    if (job.status === 'SUCCEEDED' && before && before !== 'SUCCEEDED' && !celebrated.has(job.id)) { celebrated.add(job.id); done.push(job.id) }
  }
  previous.clear()
  for (const job of jobs) previous.set(job.id, job.status)
  return done
}
