/**
 * 穿搭收藏详情的文案与分组（体验改版，2026-11-23）：拆出的物品分成“衣服”和“配饰”，穿法、姿势用人话显示。
 * 角色与服务端 OutfitRules.Role 一致；鞋算衣服（一套里少不了），其余小件算配饰。
 */
export const CLOTHING_ROLES = new Set(['TOP', 'INNER', 'OUTER', 'BOTTOM', 'ONE_PIECE', 'OVERALL', 'SHOES'])

export const WEAR_LABEL: Record<string, string> = {
  TUCKED: '塞进去', HALF_TUCKED: '塞一角', UNTUCKED: '放下来', OPEN: '敞开穿', CLOSED: '扣上穿',
}

export const STANCE_LABEL: Record<string, string> = {
  STANDING: '站姿', WALKING: '走路', SITTING: '坐姿', LEANING: '倚靠', SQUATTING: '蹲姿', OTHER: '动作',
}

/** 卡片上的小标签：版型、长度、穿法，去空去重，最多三个。 */
export function itemChips(item: { fit?: string; length?: string; wear?: string }): string[] {
  const chips = [item.fit, item.length, item.wear ? WEAR_LABEL[item.wear] : ''].map(value => (value || '').trim()).filter(Boolean)
  return [...new Set(chips)].slice(0, 3)
}

/** 位置框 [左, 上, 右, 下]（0–1）→ 叠在截图上的百分比样式；不合法的不画。 */
export function boxStyle(box: number[] | null | undefined): Record<string, string> | null {
  if (!box || box.length !== 4 || box.some(value => !Number.isFinite(value))) return null
  const [left, top, right, bottom] = box
  if (!(left < right && top < bottom) || left < 0 || top < 0 || right > 1 || bottom > 1) return null
  const pct = (value: number) => `${(value * 100).toFixed(2)}%`
  return { left: pct(left), top: pct(top), width: pct(right - left), height: pct(bottom - top) }
}

/** 编号徽章：①②③…，超过 20 用数字。 */
export function badge(position: number): string {
  return position >= 1 && position <= 20 ? String.fromCodePoint(0x2460 + position - 1) : String(position)
}
