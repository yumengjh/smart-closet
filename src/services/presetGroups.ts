/** 预设衣物的纯计算部分（分组、查询参数），不依赖网络层，便于测试。 */
export type PresetFilter = { gender?: string; styles?: string[]; season?: string }
type Groupable = { fields: Record<string, string[]>; name?: string | null }

export function presetQuery(filter: PresetFilter): string {
  const q = new URLSearchParams()
  if (filter.gender) q.set('gender', filter.gender)
  for (const s of filter.styles || []) q.append('styles', s)
  if (filter.season) q.set('season', filter.season)
  const text = q.toString()
  return text ? `?${text}` : ''
}

/** 衣柜位置分组，与后端 OutfitRules 的大类一致；品类看不出时归入“其他”。 */
export const PRESET_GROUPS = ['上装', '外套', '下装', '连体', '鞋', '配饰', '其他'] as const
export type PresetGroup = typeof PRESET_GROUPS[number]
const GROUP_WORDS: [PresetGroup, RegExp][] = [
  ['外套', /外套|夹克|大衣|风衣|西装|羽绒|冲锋衣|开衫|马甲/],
  ['连体', /连衣裙|连体|背带|吊带裙|JSK|套装/],
  ['下装', /裤|裙/],
  ['鞋', /鞋|靴/],
  ['配饰', /帽|包|围巾|腰带|袜|眼镜|手套|发箍|头饰/],
  ['上装', /T恤|衬衫|卫衣|毛衣|针织|背心|吊带|Polo|上衣|打底/i],
]
export function presetGroup(item: Groupable): PresetGroup {
  const text = [...(item.fields.category || []), item.name || ''].join(' ')
  return GROUP_WORDS.find(([, re]) => re.test(text))?.[0] || '其他'
}
export function groupPresets<T extends Groupable>(items: T[]): { group: PresetGroup; items: T[] }[] {
  return PRESET_GROUPS.map(group => ({ group, items: items.filter(item => presetGroup(item) === group) })).filter(g => g.items.length)
}


/** 没有名称的衣物用“颜色 + 品类”兜底，和衣柜卡片一致。 */
export function presetName(item: { name?: string | null; fields: Record<string, string[]> }): string {
  if (item.name) return item.name
  const color = (item.fields.primaryColor || [])[0] || ''; const category = (item.fields.category || [])[0] || '衣物'
  return `${color === '未知颜色' ? '' : color}${category}`
}
