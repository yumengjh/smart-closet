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
}
const FALLBACK = '视频中人物衣服替换成参考图中衣服'
const KEEP = '保持人物的脸、发型、动作和背景不变，保持服装的颜色、图案、文字和版型。'
export type WearingItem = { wearingRole?: string | null }
export function tryOnPrompt(items: readonly WearingItem[]) {
  if (items.length === 1) return `${wears[items[0].wearingRole || '']?.single || FALLBACK}。${KEEP}`
  const mapping = items.map((item, i) => `第${i + 1}格是${wears[item.wearingRole || '']?.slot || '服装，穿在它原本的位置'}`).join('；')
  return `${FALLBACK}。${mapping ? `参考图从左到右、从上到下：${mapping}。` : ''}${KEEP}`
}
export function framingHint(items: readonly WearingItem[]) {
  return items.some(i => ['BOTTOM', 'ONE_PIECE', 'OVERALL', 'SHOES', 'SOCKS'].includes(i.wearingRole || ''))
    ? '试穿下装或连衣裙时，请后退一些，让腰部、腿部和衣物下摆进入画面。'
    : '请让要试穿的身体部位完整进入画面，避免只拍到脸。'
}
