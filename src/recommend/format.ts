/** Pure display helpers for the recommendation UI (unit-tested with node --test). */

/** Measured on the labelled evaluation set (reports/recommend-p3): top-5 hit rate and "nothing" answered correctly. */
export const STRICTNESS_NOTES: Record<number, string> = {
  0: '最宽松：描述类查询前 5 名命中 100%，但衣柜里没有时约 20% 会给出不相关的结果',
  25: '偏宽松：命中 100%，衣柜里没有时 90% 能如实说没有',
  50: '推荐：命中 95%，衣柜里没有就说没有（100%）',
  75: '偏严格：命中 91%，只给更贴近的结果',
  100: '最严格：命中 84%，宁缺毋滥',
}

/** Note of the measured level nearest to an arbitrary slider value. */
export function strictnessNote(level: number): string {
  const nearest = [0, 25, 50, 75, 100].reduce((a, b) => Math.abs(b - level) < Math.abs(a - level) ? b : a)
  return STRICTNESS_NOTES[nearest]
}

/** "上次穿着：3 天前" for a yyyy-mm-dd wear date in local time; empty when never worn. */
export function wornLabel(day: string | undefined | null, now = Date.now()): string {
  if (!day) return ''
  const start = new Date(day + 'T00:00:00').getTime(); const today = new Date(now); today.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - start) / 86_400_000)
  return days <= 0 ? '今天穿过' : `上次穿着：${days} 天前`
}
