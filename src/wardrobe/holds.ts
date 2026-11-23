import { reactive } from 'vue'
import { garmentMarkApi, type HoldStatus } from '../services/inspirations'
import { track } from '../services/analytics'

/**
 * 临时状态（穿搭收藏设计 6.2）：在洗、送修、借出、收起来了。设了就暂时不推荐，到期自动恢复（服务端折算）。
 * 衣柜列表页加载一页后批量取一次，衣架、平铺卡片与快看卡共用这一份，详情页改了立即写回。
 */
export const HOLD_OPTIONS: { value: Exclude<HoldStatus, 'NONE'>; label: string; hint: string }[] = [
  { value: 'LAUNDRY', label: '在洗', hint: '默认 3 天后回来' },
  { value: 'REPAIR', label: '送修', hint: '改衣、修鞋' },
  { value: 'LENT', label: '借出', hint: '借给别人了' },
  { value: 'STORED', label: '收起来了', hint: '换季收纳' },
]
export const holdLabel = (status: HoldStatus | null | undefined) => HOLD_OPTIONS.find(option => option.value === status)?.label || ''

const holds = reactive(new Map<string, HoldStatus>())
export const holdOf = (garmentId: string) => { const status = holds.get(garmentId); return status && status !== 'NONE' ? status : null }
export function rememberHold(garmentId: string, status: HoldStatus) { holds.set(garmentId, status) }

let latest = 0
/** 只取已拥有的；失败时保留旧值，不挡衣柜加载。 */
export async function loadHolds(ids: string[]) {
  const mine = ++latest
  try {
    const page = await garmentMarkApi.batch(ids)
    if (mine !== latest) return
    for (const item of page.items) holds.set(item.garmentId, item.holdStatus || 'NONE')
  } catch { /* 角标只是提示 */ }
}

/** 设临时状态并写回共享角标；埋点在这里统一报，提示与音效由调用方决定。 */
export async function applyHold(garmentId: string, status: HoldStatus, until?: string | null) {
  const mark = await garmentMarkApi.setHold(garmentId, status, until)
  rememberHold(garmentId, mark.holdActive ? mark.holdStatus : 'NONE')
  track('garment_hold_set', { status: status.toLowerCase() as 'none' | 'laundry' | 'repair' | 'lent' | 'stored' })
  return mark
}
