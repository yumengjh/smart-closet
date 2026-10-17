// 桌面端侧栏是否折叠：只是这台浏览器的偏好，读不到存储就保持展开。
const KEY = 'yixu.sidebar-collapsed.v1'
export const SIDEBAR_WIDTH = 224
export const SIDEBAR_COLLAPSED_WIDTH = 72
type Store = Pick<Storage, 'getItem' | 'setItem'>

export function readCollapsed(store: Store | undefined = local()): boolean {
  try { return store?.getItem(KEY) === '1' } catch { return false }
}
export function saveCollapsed(collapsed: boolean, store: Store | undefined = local()) {
  try { store?.setItem(KEY, collapsed ? '1' : '0') } catch { /* storage blocked */ }
}
export function sidebarWidth(collapsed: boolean) { return collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }
function local(): Store | undefined { try { return globalThis.localStorage } catch { return undefined } }
