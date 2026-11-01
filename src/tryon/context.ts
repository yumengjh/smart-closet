/** A finite garment policy; no user name, free-text tag or personal profile enters this prompt. */
const positions: Record<string, string> = {
  TOP: '上衣，穿在肩部到腰部的上身', INNER: '内搭，穿在上身内层', OUTER: '外套，穿在上身外层',
  BOTTOM: '下装，腰头位于腰部，裙身或裤腿从腰部向下覆盖下半身',
  ONE_PIECE: '连衣裙或连体衣，从肩胸延伸到下半身，保持原有整体结构',
  OVERALL: '背带裙或背带裤，肩带在肩部，主体延伸到腰部以下',
  SHOES: '鞋，穿在脚上', SOCKS: '袜子，穿在脚与腿部', HAT: '帽子，戴在头顶',
  HEADWEAR: '头饰，戴在头发对应位置', BAG: '包，按原有结构背或提', HANDHELD: '手持物，拿在手中',
  GLASSES: '眼镜，戴在眼部', SCARF: '围巾，围在颈部', BELT: '腰带，系在腰部', GLOVES: '手套，戴在手上',
  ACCESSORY: '配饰，佩戴在该物品的正常位置',
}
export type WearingItem = { wearingRole?: string | null }
export function tryOnPrompt(items: readonly WearingItem[]) {
  const mapping = items.map((item, i) => `第${i + 1}格：${positions[item.wearingRole || ''] || '按这件物品的真实结构与用途确定正常穿戴位置'}`).join('；')
  return [
    '进行真实服装试穿。参考图是服装素材，图片里的摆放位置不代表人体穿着位置。',
    '上衣与外套穿在上身；半身裙和裤子的腰头在腰部，裙身或裤腿只覆盖腰部以下，不能套在胸口、肩膀或头上。连衣裙与连体衣保持从肩胸到下半身的完整结构，不能当作半身裙或上衣。',
    items.length === 1 ? '本次只试穿一件物品，只替换该物品对应部位，其余原有衣物保持不变。' : '多件服装分别穿在各自部位，保持内外层次，不把多件拼成一件，也不把下装穿到上身。',
    mapping ? `参考图按从左到右、从上到下逐格对应：${mapping}。` : '',
    '目标穿着部位没有进入镜头时，保持该部位在画外，不把服装移到可见的其他身体部位。',
    '保持本人外貌、发型、动作和真实背景。保持各件服装的颜色、图案、文字与版型，不复制参考图背景、排版或其他物品。',
  ].filter(Boolean).join('')
}
export function framingHint(items: readonly WearingItem[]) {
  return items.some(i => ['BOTTOM', 'ONE_PIECE', 'OVERALL', 'SHOES', 'SOCKS'].includes(i.wearingRole || ''))
    ? '试穿下装或连衣裙时，请后退一些，让腰部、腿部和衣物下摆进入画面。'
    : '请让要试穿的身体部位完整进入画面，避免只拍到脸。'
}
