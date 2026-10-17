// 衣柜每页件数：只是这台浏览器的浏览习惯，读不到存储就用默认值。服务端每页最多 50 件。
export const PAGE_SIZES = [12, 24, 36, 48] as const
export const DEFAULT_PAGE_SIZE = 24
const KEY = 'yixu.wardrobe-page-size.v1'
type Store = Pick<Storage, 'getItem' | 'setItem'>

export function readPageSize(store: Store | undefined = local()): number {
  try { const n = Number(store?.getItem(KEY)); return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE } catch { return DEFAULT_PAGE_SIZE }
}
export function savePageSize(size: number, store: Store | undefined = local()) {
  try { if ((PAGE_SIZES as readonly number[]).includes(size)) store?.setItem(KEY, String(size)) } catch { /* storage blocked */ }
}
/** After changing the page size, stay on the page that contains the first garment you were looking at. */
export function pageAfterSizeChange(page: number, oldSize: number, newSize: number): number {
  return Math.floor(((Math.max(1, page) - 1) * oldSize) / newSize) + 1
}
function local(): Store | undefined { try { return globalThis.localStorage } catch { return undefined } }
