// 衣架视图（清新改版设计 §4）：把当前页的衣物按品类挂到几个隔间，并汇总颜色家族做色谱。全部在本机计算。
import { roleFromGarment, type OutfitRole } from '../domain/outfit.ts'
import type { Garment } from '../services/api'

export type BayKey = 'OUTER' | 'TOP' | 'ONE_PIECE' | 'BOTTOM' | 'SHOES' | 'EXTRAS' | 'OTHER'
export type Bay = { key: BayKey; label: string; shelf: boolean; items: Garment[] }
const BAYS: { key: BayKey; label: string; shelf: boolean; roles: OutfitRole[] }[] = [
  { key: 'OUTER', label: '外套', shelf: false, roles: ['OUTER'] },
  { key: 'TOP', label: '上装', shelf: false, roles: ['TOP'] },
  { key: 'ONE_PIECE', label: '连衣裙与连体', shelf: false, roles: ['ONE_PIECE'] },
  { key: 'BOTTOM', label: '下装', shelf: false, roles: ['BOTTOM'] },
  { key: 'SHOES', label: '鞋', shelf: true, roles: ['SHOES'] },
  { key: 'EXTRAS', label: '包与配饰', shelf: true, roles: ['BAG', 'HAT', 'ACCESSORY'] },
  { key: 'OTHER', label: '其他', shelf: false, roles: ['OTHER'] },
]

/** Bays in a fixed order; empty bays are left out. Garments keep the list's order inside a bay. */
export function rackBays(items: Pick<Garment, 'category'>[]): Bay[] {
  const byRole = new Map<BayKey, Garment[]>()
  for (const item of items) {
    const role = roleFromGarment(item)
    const bay = BAYS.find(entry => entry.roles.includes(role))!
    byRole.set(bay.key, [...(byRole.get(bay.key) || []), item as Garment])
  }
  return BAYS.filter(bay => byRole.has(bay.key)).map(({ key, label, shelf }) => ({ key, label, shelf, items: byRole.get(key)! }))
}

/** A small, stable tilt (-3…3°) so a stacked row looks hung by hand rather than printed. */
export function pileTilt(id: string) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return (Math.abs(hash) % 7) - 3
}

export type ColorFamily = '白' | '米' | '灰' | '黑' | '棕' | '红' | '粉' | '黄' | '绿' | '蓝' | '紫'
export const FAMILY_SWATCH: Record<ColorFamily, string> = {
  白: '#F2F0EA', 米: '#DCCBAA', 灰: '#A9AEAC', 黑: '#2B2D30', 棕: '#8B6247', 红: '#B8404A', 粉: '#EEB0C2', 黄: '#EDCB57', 绿: '#8DB08A', 蓝: '#5D87C6', 紫: '#A592CA',
}
const FAMILY_ORDER = Object.keys(FAMILY_SWATCH) as ColorFamily[]
// Colour names first (they are what the user confirmed); longer words before the single characters they contain.
const NAME_RULES: [RegExp, ColorFamily][] = [
  [/酒红|枣红|砖红|玫红/, '红'], [/藏青|海军|牛仔|靛|天蓝|宝蓝/, '蓝'], [/卡其|杏|驼|奶咖|燕麦|象牙|奶油/, '米'], [/咖|焦糖|巧克力/, '棕'],
  [/银/, '灰'], [/金|橙|橘|姜/, '黄'], [/青|薄荷|橄榄|军/, '绿'], [/奶白|米白/, '白'],
  [/白/, '白'], [/米/, '米'], [/灰/, '灰'], [/黑/, '黑'], [/棕|褐/, '棕'], [/粉/, '粉'], [/红/, '红'], [/黄/, '黄'], [/绿/, '绿'], [/蓝/, '蓝'], [/紫/, '紫'],
]
export function familyFromName(name: string | undefined): ColorFamily | null {
  if (!name) return null
  return NAME_RULES.find(([pattern]) => pattern.test(name))?.[1] ?? null
}
/** Fallback from the picture's average colour (#rrggbb). */
export function familyFromHex(hex: string | undefined): ColorFamily | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let hue = 0
  if (d) { hue = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; hue *= 60 }
  if (l < .2) return '黑'
  if (sat < .14) return l > .8 ? '白' : l > .32 ? '灰' : '黑'
  if (l > .82 && sat < .45) return hue >= 20 && hue < 70 ? '米' : '白'
  if (hue < 15 || hue >= 345) return l > .7 ? '粉' : '红'
  if (hue < 45) return l < .45 ? '棕' : sat < .45 ? '米' : '棕'
  if (hue < 70) return sat < .4 ? '米' : '黄'
  if (hue < 165) return '绿'
  if (hue < 255) return '蓝'
  if (hue < 300) return '紫'
  return l > .6 ? '粉' : '红'
}
export function garmentFamily(item: Pick<Garment, 'primaryColor' | 'imageColor'>): ColorFamily | null {
  return familyFromName(item.primaryColor[0]) ?? familyFromHex(item.imageColor)
}
export type FamilyShare = { family: ColorFamily; swatch: string; count: number; ids: string[] }
/** Families present in the list, in a fixed light-to-colourful order. */
export function colorFamilies(items: Pick<Garment, 'id' | 'primaryColor' | 'imageColor'>[]): FamilyShare[] {
  const ids = new Map<ColorFamily, string[]>()
  for (const item of items) { const family = garmentFamily(item); if (family) ids.set(family, [...(ids.get(family) || []), item.id]) }
  return FAMILY_ORDER.filter(family => ids.has(family)).map(family => ({ family, swatch: FAMILY_SWATCH[family], count: ids.get(family)!.length, ids: ids.get(family)! }))
}
