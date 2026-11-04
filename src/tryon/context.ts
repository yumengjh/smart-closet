/** A finite garment policy; no user name, free-text tag or personal profile enters this prompt. */
type Wear = { single: string; slot: string }
/** 正向描述换哪里、哪里不动：只写本次相关部位，不列其他品类，也不写“不能穿到哪里”。 */
const wears: Record<string, Wear> = {
  TOP: { single: '视频中人物的上衣替换成参考图中的上衣，下半身保持原样', slot: '上衣，穿在上身' },
  INNER: { single: '视频中人物的内搭替换成参考图中的上衣，外套和下半身保持原样', slot: '内搭，穿在上身内层' },
  OUTER: { single: '给视频中人物穿上参考图中的外套，里面的衣服和下半身保持原样', slot: '外套，穿在上身最外层' },
  BOTTOM: { single: '视频中人物腰部以下的裤子或裙子替换成参考图中的下装，腰头系在腰部，只改变腰部以下，上半身保持原样', slot: '下装，腰头系在腰部，穿在腰部以下' },
  ONE_PIECE: { single: '视频中人物的全身衣服替换成参考图中的连衣裙或连体衣', slot: '连衣裙或连体衣，从肩部穿到下半身' },
  OVERALL: { single: '给视频中人物穿上参考图中的背带裙或背带裤，肩带在肩上，主体从胸前延伸到腰部以下，里面的上衣保持原样', slot: '背带裙或背带裤，肩带在肩上，主体延伸到腰部以下' },
  SHOES: { single: '视频中人物脚上的鞋替换成参考图中的鞋，衣服保持原样', slot: '鞋，穿在脚上' },
  SOCKS: { single: '给视频中人物的脚和小腿穿上参考图中的袜子，衣服保持原样', slot: '袜子，穿在脚和小腿上' },
  HAT: { single: '给视频中人物戴上参考图中的帽子，衣服保持原样', slot: '帽子，戴在头顶' },
  HEADWEAR: { single: '给视频中人物的头发戴上参考图中的头饰，衣服保持原样', slot: '头饰，戴在头发上' },
  BAG: { single: '让视频中人物背上参考图中的包，衣服保持原样', slot: '包，背在身上或提在手中' },
  HANDHELD: { single: '让视频中人物手中拿着参考图中的物品，衣服保持原样', slot: '手持物，拿在手中' },
  GLASSES: { single: '给视频中人物戴上参考图中的眼镜，衣服保持原样', slot: '眼镜，戴在眼部' },
  SCARF: { single: '给视频中人物的颈部围上参考图中的围巾，衣服保持原样', slot: '围巾，围在颈部' },
  BELT: { single: '给视频中人物的腰部系上参考图中的腰带，衣服保持原样', slot: '腰带，系在腰部' },
  GLOVES: { single: '给视频中人物的手戴上参考图中的手套，衣服保持原样', slot: '手套，戴在手上' },
  ACCESSORY: { single: '给视频中人物佩戴参考图中的配饰，衣服保持原样', slot: '配饰，佩戴在正常位置' },
  // 以下只用于试穿，推荐引擎的分类里没有这些位置。
  EAR: { single: '给视频中人物的耳朵戴上参考图中的耳饰，衣服保持原样', slot: '耳饰，戴在耳朵上' },
  NECK: { single: '给视频中人物的颈部戴上参考图中的项链，衣服保持原样', slot: '项链，戴在颈部' },
  WRIST: { single: '给视频中人物的手腕戴上参考图中的手表或手链，衣服保持原样', slot: '手表或手链，戴在手腕上' },
  FINGER: { single: '给视频中人物的手指戴上参考图中的戒指，衣服保持原样', slot: '戒指，戴在手指上' },
  ARM: { single: '给视频中人物的手臂戴上参考图中的臂环或袖套，衣服保持原样', slot: '臂环或袖套，戴在手臂上' },
}
const FALLBACK = '视频中人物衣服替换成参考图中衣服'
type WearOption = { value: string; label: string }
/** 用户可选的穿戴位置，按身体部位分组：固定列表，提示词只认这些值，不接受自由文字。 */
export const WEAR_GROUPS: readonly { label: string; options: readonly WearOption[] }[] = [
  { label: '头部', options: [{ value: 'HAT', label: '帽子' }, { value: 'HEADWEAR', label: '头饰' }, { value: 'GLASSES', label: '眼镜' }, { value: 'EAR', label: '耳饰' }] },
  { label: '颈部', options: [{ value: 'NECK', label: '项链' }, { value: 'SCARF', label: '围巾' }] },
  { label: '上身', options: [{ value: 'TOP', label: '上衣' }, { value: 'INNER', label: '内搭' }, { value: 'OUTER', label: '外套' }] },
  { label: '手和手臂', options: [{ value: 'WRIST', label: '手表或手链' }, { value: 'FINGER', label: '戒指' }, { value: 'ARM', label: '臂环或袖套' }, { value: 'GLOVES', label: '手套' }, { value: 'HANDHELD', label: '手持物' }] },
  { label: '下身', options: [{ value: 'BOTTOM', label: '裤子或裙子' }, { value: 'BELT', label: '腰带' }] },
  { label: '全身', options: [{ value: 'ONE_PIECE', label: '连衣裙或连体衣' }, { value: 'OVERALL', label: '背带裙或背带裤' }] },
  { label: '脚部', options: [{ value: 'SHOES', label: '鞋' }, { value: 'SOCKS', label: '袜子' }] },
  { label: '其他', options: [{ value: 'BAG', label: '包' }, { value: 'ACCESSORY', label: '其他配饰' }] },
]
export const WEAR_OPTIONS: readonly WearOption[] = WEAR_GROUPS.flatMap(g => g.options)
const has = (items: readonly WearingItem[], roles: readonly string[]) => items.some(i => roles.includes(i.wearingRole || ''))
/** 保持不变的部分避开本次要动的部位：戴眼镜不再要求脸不变，戴帽子或头饰不再要求发型不变，拿东西不再要求动作不变。 */
function keep(items: readonly WearingItem[]) {
  const parts = [has(items, ['GLASSES']) ? '五官' : '脸', has(items, ['HAT', 'HEADWEAR']) ? '发色' : '发型', ...(has(items, ['HANDHELD']) ? [] : ['动作']), '背景']
  return `保持人物的${parts.slice(0, -1).join('、')}和${parts.at(-1)}不变，保持服装的颜色、图案、文字和版型。`
}
export type WearingItem = { wearingRole?: string | null }
export function tryOnPrompt(items: readonly WearingItem[]) {
  if (items.length === 1) return `${wears[items[0].wearingRole || '']?.single || FALLBACK}。${keep(items)}`
  const mapping = items.map((item, i) => `第${i + 1}格是${wears[item.wearingRole || '']?.slot || '服装，穿在它原本的位置'}`).join('；')
  return `${FALLBACK}。${mapping ? `参考图从左到右、从上到下：${mapping}。` : ''}${keep(items)}`
}
/** 提示词改不了人的姿势和取景，需要靠拍摄引导：手持物要抬手，头部配饰要正对镜头，下装要后退。 */
export function framingHint(items: readonly WearingItem[]) {
  if (has(items, ['HANDHELD'])) return '试穿手持物时，请把手抬进画面，做出拿东西的手势。'
  if (has(items, ['WRIST', 'FINGER', 'GLOVES', 'ARM'])) return '试戴手表、戒指、手套或臂饰时，请把手和手臂抬到胸前，让它们清楚地进入画面。'
  if (has(items, ['BOTTOM', 'ONE_PIECE', 'OVERALL', 'SHOES', 'SOCKS'])) return '试穿下装或连衣裙时，请后退一些，让腰部、腿部和衣物下摆进入画面。'
  if (has(items, ['EAR'])) return '试戴耳饰时，请把头发拨到耳后，让耳朵露出来。'
  if (has(items, ['GLASSES', 'HAT', 'HEADWEAR', 'NECK'])) return '试戴眼镜、帽子、头饰或项链时，请正对镜头，让头部和颈部清楚地进入画面。'
  return '请让要试穿的身体部位完整进入画面，避免只拍到脸。'
}
