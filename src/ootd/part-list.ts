// “这次穿上身”部位清单的纯逻辑（server 设计 2026-11-21-做张图：穿前检查与姿势预览重设计 3.1、4.1、4.4）：
// /api/outfit-reviews 的返回 → 清单行、标题右侧的小状态、底栏的一句原因、第一个要处理的位置，
// 以及回答问题、这次不穿、穿回来、配饰位置对 selectedGarmentIds / wearRoles 的变换。页面只负责渲染。
// “这次不穿”只用 selectedGarmentIds 表示（去掉那件），不发 SKIP；也不再发 multiLayer。
import type { Ask, PartItem, PartKey, Review, ReviewFix } from '../services/platform'

export type FitGarment = { id: string; label: string; thumb?: string | null }
export type WearState = { selected: string[]; wearRoles: Record<string, string> }
/** 去加 ›：缺主体（ADD_*）、要换掉的衣服（REPLACE）；鞋那一行“不穿鞋”也能去加一双。 */
export type FitFix = ReviewFix | 'ADD_SHOES'
/** issues：标在这件衣服上的拦截（blocker 带 garmentId 时），定位键是 item:<garmentId>。 */
export type FitItem = PartItem & { key: string; thumb: string | null; accessory: boolean; issues: FitIssue[] }
export type FitRow = { key: string; part: PartKey | string; label: string; state: 'OK' | 'MISSING' | 'NONE'; items: FitItem[]; message: string; fix: FitFix | null; blocking: boolean }
export type FitIssue = { key: string; message: string; fix: FitFix | null }
export type FitAsk = { key: string; code: Ask['code']; message: string; garmentIds: string[]; garments: FitGarment[]; options: { value: string; label: string }[] }
export type FitStatus = { tone: 'ok' | 'ask' | 'block' | 'idle'; text: string }
export type FitView = { legacy: boolean; rows: FitRow[]; issues: FitIssue[]; asks: FitAsk[]; skipped: FitGarment[]; notes: string[]; status: FitStatus; first: string | null }

export const ACCESSORY_OPTIONS = [{ value: 'ACCESSORY:EAR', label: '耳部' }, { value: 'ACCESSORY:NECK', label: '颈部' }, { value: 'ACCESSORY:WRIST', label: '手腕' }, { value: 'ACCESSORY:HAND_LEFT', label: '左手' }, { value: 'ACCESSORY:HAND_RIGHT', label: '右手' }, { value: 'ACCESSORY:TIE', label: '领带' }]
const POSITIONS = ACCESSORY_OPTIONS.map(item => item.value.slice('ACCESSORY:'.length))
/** “这件穿在哪？”：只对认不出品类的衣服生效（PART:*），“这次不穿”就是从这次穿的里去掉。 */
export const PART_OPTIONS = [{ value: 'TOP', label: '上身' }, { value: 'BOTTOM', label: '下身' }, { value: 'OUTER', label: '外套' }, { value: 'SHOES', label: '鞋' }, { value: 'ACCESSORY', label: '配饰' }, { value: 'HANDHELD', label: '拿在手里' }, { value: 'SKIP', label: '这次不穿' }]
export const SKIP = 'SKIP'
const ORDER: string[] = ['FULL', 'UPPER', 'LOWER', 'OUTER', 'SHOES', 'EXTRA']
const MISSING_TEXT: Record<string, string> = { FULL: '还差上衣和下装，或一件连衣裙', UPPER: '还差上衣', LOWER: '还差下装' }
const MISSING_FIX: Record<string, FitFix> = { FULL: 'ADD_MAIN', UPPER: 'ADD_TOP', LOWER: 'ADD_BOTTOM' }
const FIX_PART: Partial<Record<FitFix, string>> = { ADD_TOP: 'UPPER', ADD_BOTTOM: 'LOWER' }

const askLine = (count: number) => count === 1 ? '有一件要你选' : `有 ${count} 件要你选`
const asksOf = (review: Review | null | undefined) => review?.asks || []

/** 服务端开关关闭（composition-v1）或旧服务没有 parts 时，退回列出 blockers 的旧样式。v2 至少有上下身（或全身）与鞋，不会为空。 */
export const legacyReview = (review: Review | null | undefined) => !review?.parts?.length

/** 没有拦截、也没有要回答的问题时才能生成（与服务端 passed() 一致）。 */
export const reviewPassed = (review: Review | null | undefined) => Boolean(review) && !review!.blockers.length && !asksOf(review).length

/** 这次不能生成的一句话：只看检查结果（第一个拦截 > 有 N 件要你选）；能生成时为空。 */
export function reviewReason(review: Review | null | undefined): string {
  if (!review) return ''
  if (review.blockers.length) return review.blockers[0].message
  const asks = asksOf(review).length
  return asks ? askLine(asks) : ''
}
/** 底栏的一句原因：检查结果优先，其次是页面自己的原因（如“先设置谁来穿”）。 */
export const barReason = (review: Review | null | undefined, other = '') => reviewReason(review) || other

/** 标题右侧的小状态：✓ 可以了 / 有一件要你选 / 还差下装；没有结果时不显示大块加载，只给一句小字。 */
export function fitStatus(review: Review | null | undefined, extra: { error?: string } = {}): FitStatus {
  if (!review) return extra.error ? { tone: 'idle', text: '暂时没查到' } : { tone: 'idle', text: '' }
  if (review.blockers.length) return { tone: 'block', text: review.blockers[0].message }
  const asks = asksOf(review).length
  return asks ? { tone: 'ask', text: askLine(asks) } : { tone: 'ok', text: '可以了' }
}

function labelOf(id: string, garments: FitGarment[], review: Review) {
  return garments.find(item => item.id === id)?.label || review.items.find(item => item.garmentId === id)?.label || '这件'
}
function thumbOf(id: string, garments: FitGarment[]) { return garments.find(item => item.id === id)?.thumb || null }

/** 检查结果 → 清单。selected 是这次穿的（立刻把刚去掉的衣服挪到“这次不穿”，不等重查）。 */
export function fitView(review: Review | null | undefined, garments: FitGarment[], selected: string[], extra: { error?: string } = {}): FitView {
  const chosen = new Set(selected)
  const skipped = garments.filter(item => !chosen.has(item.id))
  const status = fitStatus(review, extra)
  if (!review) return { legacy: false, rows: [], issues: [], asks: [], skipped, notes: [], status, first: null }
  const accessory = new Set(review.items.filter(item => item.role === 'ACCESSORY').map(item => item.garmentId))
  const item = (worn: PartItem): FitItem => ({ ...worn, key: `item:${worn.garmentId}`, thumb: thumbOf(worn.garmentId, garments), accessory: accessory.has(worn.garmentId), issues: [] })
  if (legacyReview(review)) {
    // 旧样式：按 v1 的 slots 列出有衣服的位置，拦截逐条列出，提示放在末尾。
    const rows: FitRow[] = review.slots.filter(slot => slot.items.some(worn => chosen.has(worn.garmentId))).map(slot => ({
      key: `slot:${slot.role}`, part: slot.role, label: slot.label, state: 'OK', message: '', fix: null, blocking: slot.state === 'CONFLICT' || slot.state === 'UNKNOWN',
      items: slot.items.filter(worn => chosen.has(worn.garmentId)).map(worn => item({ garmentId: worn.garmentId, label: worn.label, layer: 'MAIN', position: POSITIONS.includes(worn.position) ? worn.position : null, note: null })),
    }))
    const issues = review.blockers.map((blocker, index) => ({ key: `issue:${index}`, message: blocker.message, fix: null }))
    return { legacy: true, rows, issues, asks: [], skipped, notes: review.warnings.map(warning => warning.message), status, first: issues[0]?.key || null }
  }
  const parts = [...review.parts!].sort((a, b) => ORDER.indexOf(a.part) - ORDER.indexOf(b.part))
  const rows: FitRow[] = parts.map(part => ({
    key: `part:${part.part}`, part: part.part, label: part.label, state: part.state,
    items: part.items.filter(worn => chosen.has(worn.garmentId)).map(item),
    message: part.state === 'MISSING' ? MISSING_TEXT[part.part] || `还差${part.label}` : part.state === 'NONE' ? '不穿鞋' : '',
    fix: part.state === 'MISSING' ? MISSING_FIX[part.part] || 'ADD_MAIN' : part.state === 'NONE' ? 'ADD_SHOES' : null,
    blocking: part.state === 'MISSING',
  }))
  // 缺主体的拦截放到对应那一行（还差上衣 → 上身，还差下装 → 下身，都没有 → 第一行缺的）；
  // 带 garmentId 的标到那件衣服上（如“去换 ›”）；那件不在清单里或没有 garmentId 时才放到清单顶部。
  const issues: FitIssue[] = [], targets: string[] = []
  review.blockers.forEach((blocker, index) => {
    const fix = blocker.fix || null
    const structural = blocker.code === 'STRUCTURE_INVALID' || fix === 'ADD_TOP' || fix === 'ADD_BOTTOM' || fix === 'ADD_MAIN'
    const wanted = fix && FIX_PART[fix]
    const row = structural ? rows.find(row => row.state === 'MISSING' && (!wanted || row.part === wanted)) || rows.find(row => row.state === 'MISSING') : undefined
    if (row) { row.message = blocker.message; if (fix) row.fix = fix; targets.push(row.key); return }
    const owner = blocker.garmentId ? rows.flatMap(row => row.items).find(worn => worn.garmentId === blocker.garmentId) : undefined
    if (owner) { owner.issues.push({ key: owner.key, message: blocker.message, fix: fix === 'REPLACE' ? fix : null }); targets.push(owner.key); return }
    const issue = { key: `issue:${index}`, message: blocker.message, fix: fix === 'REPLACE' ? fix : null }
    issues.push(issue); targets.push(issue.key)
  })
  const asks: FitAsk[] = asksOf(review).map((ask, index) => ({
    key: `ask:${index}`, code: ask.code, message: ask.message, garmentIds: ask.garmentIds,
    garments: ask.garmentIds.map(id => ({ id, label: labelOf(id, garments, review), thumb: thumbOf(id, garments) })),
    options: ask.code === 'CHOOSE_PART' ? PART_OPTIONS : ask.garmentIds.map(id => ({ value: id, label: labelOf(id, garments, review) })),
  }))
  return { legacy: false, rows, issues, asks, skipped, notes: [], status, first: targets[0] || asks[0]?.key || null }
}

/** 第一个要处理的位置（点禁用的生成按钮时滚到这里）：先拦截，后问题。 */
export const firstTarget = (review: Review | null | undefined, garments: FitGarment[] = [], selected: string[] = review?.items.map(item => item.garmentId) || []) => fitView(review, garments, selected).first

function withRole(roles: Record<string, string>, id: string, role: string | null) {
  const next = { ...roles }
  if (role) next[id] = role; else delete next[id]
  return next
}
/** 这次不穿：从这次穿的里去掉，并清掉它的穿法。 */
export function skipGarment(state: WearState, id: string): WearState {
  return { selected: state.selected.filter(item => item !== id), wearRoles: withRole(state.wearRoles, id, null) }
}
/** 穿回来：按搭配里原来的顺序放回。 */
export function wearAgain(state: WearState, id: string, order: string[]): WearState {
  if (state.selected.includes(id)) return state
  const chosen = new Set([...state.selected, id])
  return { selected: [...order.filter(item => chosen.has(item)), ...[...state.selected, id].filter(item => !order.includes(item))], wearRoles: state.wearRoles }
}
/**
 * 当场回答一个问题：
 * CHOOSE_INNER → wearRoles[选中]='INNER'（同一问题里其他件不再是 INNER）；
 * CHOOSE_ONE → 没选的这次不穿；
 * CHOOSE_PART → wearRoles[id]='PART:X'，选“这次不穿”就去掉这件。
 * 结果回来前可以改答案：被去掉的那件按 order（搭配里的顺序）放回。
 */
export function answerAsk(state: WearState, ask: Pick<Ask, 'code' | 'garmentIds'>, value: string, order: string[] = []): WearState {
  if (ask.code === 'CHOOSE_INNER') {
    if (!ask.garmentIds.includes(value)) return state
    let roles = state.wearRoles
    for (const id of ask.garmentIds) if (id !== value && roles[id] === 'INNER') roles = withRole(roles, id, null)
    return { selected: state.selected, wearRoles: withRole(roles, value, 'INNER') }
  }
  if (ask.code === 'CHOOSE_ONE') {
    if (!ask.garmentIds.includes(value)) return state
    const drop = ask.garmentIds.filter(id => id !== value)
    let roles = state.wearRoles
    for (const id of drop) roles = withRole(roles, id, null)
    return { selected: wearAgain(state, value, order).selected.filter(id => !drop.includes(id)), wearRoles: roles }
  }
  const id = ask.garmentIds[0]
  if (!id) return state
  if (value === SKIP) return skipGarment(state, id)
  if (!PART_OPTIONS.some(option => option.value === value)) return state
  return { selected: wearAgain(state, id, order).selected, wearRoles: withRole(state.wearRoles, id, `PART:${value}`) }
}
/** 问题当前的答案（结果回来前先显示用户刚点的）：没答时为空。 */
export function askValue(ask: Pick<Ask, 'code' | 'garmentIds'>, state: WearState): string {
  if (ask.code === 'CHOOSE_INNER') return ask.garmentIds.find(id => state.wearRoles[id] === 'INNER') || ''
  if (ask.code === 'CHOOSE_ONE') { const kept = ask.garmentIds.filter(id => state.selected.includes(id)); return kept.length === 1 ? kept[0] : '' }
  const id = ask.garmentIds[0]
  if (!id) return ''
  if (!state.selected.includes(id)) return SKIP
  const role = state.wearRoles[id]
  return role?.startsWith('PART:') ? role.slice('PART:'.length) : ''
}
/** 配饰行的位置下拉：用户指定的优先，否则是服务端推断出的位置；都没有时是“自然佩戴”（空值，不设）。 */
export function positionValue(item: Pick<PartItem, 'garmentId' | 'position'>, wearRoles: Record<string, string>) {
  const chosen = wearRoles[item.garmentId]
  if (chosen?.startsWith('ACCESSORY:')) return chosen
  return item.position && POSITIONS.includes(item.position) ? `ACCESSORY:${item.position}` : ''
}
/** 推断不出位置时才有“自然佩戴”一项；已推断出的位置不能再改回“自然佩戴”。 */
export function positionOptions(item: Pick<PartItem, 'position'>) {
  return item.position && POSITIONS.includes(item.position) ? ACCESSORY_OPTIONS : [{ value: '', label: '自然佩戴' }, ...ACCESSORY_OPTIONS]
}
export function setPosition(state: WearState, id: string, value: string): WearState {
  return { selected: state.selected, wearRoles: withRole(state.wearRoles, id, value.startsWith('ACCESSORY:') ? value : null) }
}
/** 这件的穿法是用户回答过的（哪件穿里面 / 穿在哪），可以“重新选”。 */
export const answered = (wearRoles: Record<string, string>, id: string) => wearRoles[id] === 'INNER' || Boolean(wearRoles[id]?.startsWith('PART:'))
export function resetAnswer(state: WearState, id: string): WearState { return { selected: state.selected, wearRoles: withRole(state.wearRoles, id, null) } }
/** 衣服变了（换搭配、改了挑的衣服）：只保留仍在的衣服的穿法。 */
export function pruneWear(wearRoles: Record<string, string>, ids: string[]) {
  return Object.fromEntries(Object.entries(wearRoles).filter(([id]) => ids.includes(id)))
}
