// 右滑“就穿它”后，当天再打开“今天”页直接显示完成卡，不重播庆祝（ToC 改版（二）T10）。只存本机、按账号与日期，第二天自动失效。
import type { RecommendedGarment } from '../recommend/types'

export type WornToday = { date: string; name: string; garments: Pick<RecommendedGarment, 'id' | 'role' | 'color' | 'displayUrl' | 'name'>[] }
const key = (user: string) => `yuda.today.worn.v1:${user}`

export function readWorn(user: string, now = new Date(), store: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): WornToday | null {
  try {
    const value = JSON.parse(store?.getItem(key(user)) || 'null') as WornToday | null
    return value && value.date === now.toDateString() && Array.isArray(value.garments) ? value : null
  } catch { return null }
}
export function saveWorn(user: string, value: WornToday, store: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try { store?.setItem(key(user), JSON.stringify({ ...value, garments: value.garments.map(({ id, role, color, displayUrl, name }) => ({ id, role, color, displayUrl, name })) })) } catch { /* storage blocked */ }
}
