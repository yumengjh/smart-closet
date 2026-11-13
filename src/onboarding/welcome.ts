// 首次体验（ToC 改版 P3，#239）的纯逻辑：风格卡的配图、按性别与风格筛常见单品、本机标记。不发请求，便于单测。
import { presetGroup, type PresetGroup } from '../services/presetGroups.ts'

/** 与“我的风格 → 常穿风格”、常见单品的风格标签同一套词。 */
export const STYLE_DIRECTIONS = ['日系清新', '甜美', '法式', '都市通勤', '高智极简', '美式休闲', '老钱风', '潮流运动', '新中式', '工装风', '巴恩风', '户外机能'] as const
export const MAX_STYLES = 3
export type Sex = 'FEMALE' | 'MALE' | ''
type Preset = { id: string; gender: string | null; styles: string[]; displayUrl: string; fields: Record<string, string[]>; name?: string | null; alreadyImported?: boolean }

/** 男生不看女款、女生不看男款；中性和没标的基础款都给。与 PresetPicker 的规则一致。 */
export const fitsSex = (item: Pick<Preset, 'gender'>, sex: Sex) => !sex || item.gender !== (sex === 'MALE' ? '女款' : '男款')

/** 风格卡配图：这个风格下最多 3 件，尽量上装、下装、鞋各一件。没有就返回空，卡片只显示文字。 */
export function styleCover<T extends Preset>(items: T[], style: string, sex: Sex, max = 3): T[] {
  const pool = items.filter(item => item.styles.includes(style) && fitsSex(item, sex))
  const order: PresetGroup[] = ['上装', '连体', '下装', '外套', '鞋', '配饰', '其他']
  const picked: T[] = []
  for (const group of order) {
    const hit = pool.find(item => presetGroup(item) === group && !picked.includes(item))
    if (hit) picked.push(hit)
    if (picked.length >= max) break
  }
  return picked
}

/** 第 3 步列表：合性别；选了风格时，带这些风格的排前面，没标风格的基础款也保留（不排除）。已在衣柜的放最后。 */
export function rankPresets<T extends Preset>(items: T[], sex: Sex, styles: string[]): T[] {
  const score = (item: T) => (item.alreadyImported ? 0 : 2) + (styles.length && item.styles.some(s => styles.includes(s)) ? 1 : 0)
  return items.filter(item => fitsSex(item, sex))
    .map((item, index) => ({ item, index, s: score(item) })).sort((a, b) => b.s - a.s || a.index - b.index).map(x => x.item)
}

export function toggleStyle(chosen: string[], style: string, max = MAX_STYLES): string[] {
  if (chosen.includes(style)) return chosen.filter(s => s !== style)
  return chosen.length >= max ? chosen : [...chosen, style]
}

/** 完成首次体验后：不再自动弹常见单品引导，也不再自动播放新手指引（“我的 → 新手指引”仍可重看）。 */
export function markOnboarded(user: string, store: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try { store?.setItem('yuda.preset-onboarding.v1', 'done'); store?.setItem(`yuda.guide.v1:${user}`, 'done') } catch { /* storage blocked */ }
}
