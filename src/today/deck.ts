// “今天”页封面卡片堆的纯逻辑（ToC 改版（二）第四节）：场合、刊头、拼图位置、底色、续卡去重与滑动判定。
// 不发请求、不碰 DOM，便于单测；推荐数据来自 POST /api/recommendations 与 /more（零模型调用，T4）。
import { FAMILY_SWATCH, familyFromName } from '../wardrobe/rack.ts'

/** 场合胶囊（T9），映射到现有场合枚举；文案用口语。 */
export const TODAY_OCCASIONS = [
  { value: 'DAILY', label: '日常' }, { value: 'COMMUTE', label: '上班' }, { value: 'DATE', label: '约会' },
  { value: 'TRAVEL', label: '度假' }, { value: 'SPORT', label: '运动' },
] as const
export type TodayOccasion = typeof TODAY_OCCASIONS[number]['value']
/** 后端 Intent 限定 1～5 套（推荐数量为 1 到 5 套），/more 也会夹到 5。 */
export const FIRST_BATCH = 5
export const MORE_BATCH = 4
/** 剩下几张时去要下一批。 */
export const REFILL_AT = 2

type Piece = { id: string; role: string; color?: string; displayUrl?: string | null }
export type Slot = { id: string; url: string; left: number; top: number; width: number; height: number; z: number }

const GROUP: Record<string, 'outer' | 'top' | 'bottom' | 'dress' | 'shoes' | 'extra'> = {
  OUTER: 'outer', TOP: 'top', INNER: 'top', BOTTOM: 'bottom', ONE_PIECE: 'dress', OVERALL: 'dress', SHOES: 'shoes',
}
// 百分比位置 [left, top, width, height]，与样稿 toc.html 一致：外套在右后，上衣左上，下装居中偏下，鞋右下，配件左下。
const AT = {
  outer: [48, 2, 48, 52], top: [6, 5, 46, 44], bottom: [24, 40, 44, 56], dress: [12, 4, 52, 74], dressOuter: [50, 6, 46, 50],
  shoes: [62, 70, 32, 26], extra: [4, 66, 22, 24],
} as const
const Z = { outer: 1, top: 2, dress: 2, bottom: 3, shoes: 4, extra: 5 }

/** 把一套衣服摆成平铺拼图；每组只摆第一件，配件最多一件，没有图的跳过。 */
export function collageSlots(pieces: Piece[], url: (path: string) => string | undefined): Slot[] {
  const used = new Set<string>(), hasDress = pieces.some(p => GROUP[p.role] === 'dress'), slots: Slot[] = []
  for (const piece of pieces) {
    const group = GROUP[piece.role] ?? 'extra'
    const src = piece.displayUrl ? url(piece.displayUrl) : undefined
    if (used.has(group) || !src) continue
    used.add(group)
    const [left, top, width, height] = group === 'outer' && hasDress ? AT.dressOuter : AT[group]
    slots.push({ id: piece.id, url: src, left, top, width, height, z: Z[group] })
  }
  return slots.sort((a, b) => a.z - b.z)
}

/** 卡片底色：第一件主体衣物的颜色家族；认不出时用中性米色。 */
export function coverTint(pieces: Piece[]): string {
  const main = pieces.find(p => GROUP[p.role] && GROUP[p.role] !== 'shoes') ?? pieces[0]
  const family = familyFromName(main?.color)
  return family ? FAMILY_SWATCH[family] : FAMILY_SWATCH['米']
}

/** 续卡时按衣服组合去重，避免 /more 返回已经划过的组合。 */
export const outfitKey = (garmentIds: string[]) => [...garmentIds].sort().join(',')
export function appendUnique<T extends { garments: { id: string }[] }>(queue: T[], seen: Set<string>, incoming: T[]): T[] {
  const next = [...queue]
  for (const outfit of incoming) {
    const key = outfitKey(outfit.garments.map(g => g.id))
    if (seen.has(key)) continue
    seen.add(key); next.push(outfit)
  }
  return next
}

/** 拖动松手时的判定：距离超过 90px，或速度够快（> 0.6 px/ms）且已过 30px。1 = 就穿它，-1 = 换一套，0 = 弹回。 */
export function swipeOutcome(dx: number, velocity: number): 1 | -1 | 0 {
  if (Math.abs(dx) >= 90 || (Math.abs(dx) >= 30 && Math.abs(velocity) > 0.6 && Math.sign(velocity) === Math.sign(dx))) return dx > 0 ? 1 : -1
  return 0
}
/** 印章透明度随拖动距离变化。 */
export const stampOpacity = (dx: number, side: 1 | -1) => Math.max(0, Math.min(1, (dx * side) / 90))

/** 已保存搭配的画板元素 → 拼图用的衣物（只取衣服，不取人物贴纸）。 */
export function scenePieces(scene: { elements: { kind?: string; garmentId: string; role: string; assetUrl: string; zIndex: number }[] }) {
  return [...scene.elements].filter(e => e.kind !== 'PERSON_PART' && e.assetUrl).sort((a, b) => a.zIndex - b.zIndex).map(e => ({ id: e.garmentId, role: e.role, displayUrl: e.assetUrl }))
}
