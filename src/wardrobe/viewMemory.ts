// 衣柜浏览位置（issue #3）：离开衣柜时记下筛选、页码和滚动位置，回来时恢复。只存在本标签页的 sessionStorage，关闭标签页即清空；以图搜图的图片不保存。
export type WardrobeView = { q: string; category: string; color: string; season: string; imageStyle: string; page: number; scrollY: number; savedAt: number }
type Store = Pick<Storage, 'getItem' | 'setItem'>
const KEY = 'yixu.wardrobe-view.v1'
/** Older than this, a remembered position is stale (the closet has likely changed); start from the top. */
export const VIEW_TTL_MS = 30 * 60 * 1000

export function saveView(view: Omit<WardrobeView, 'savedAt'>, store: Store | undefined = session(), now = Date.now()) {
  try { store?.setItem(KEY, JSON.stringify({ ...view, savedAt: now })) } catch { /* storage blocked */ }
}

export function readView(store: Store | undefined = session(), now = Date.now()): WardrobeView | null {
  try {
    const raw = store?.getItem(KEY); if (!raw) return null
    const v = JSON.parse(raw) as Partial<WardrobeView>
    if (typeof v.savedAt !== 'number' || now - v.savedAt > VIEW_TTL_MS || now < v.savedAt) return null
    const text = (x: unknown) => typeof x === 'string' ? x.slice(0, 100) : ''
    const int = (x: unknown, min: number) => typeof x === 'number' && Number.isFinite(x) ? Math.max(min, Math.floor(x)) : min
    return { q: text(v.q), category: text(v.category), color: text(v.color), season: text(v.season), imageStyle: text(v.imageStyle), page: int(v.page, 1), scrollY: int(v.scrollY, 0), savedAt: v.savedAt }
  } catch { return null }
}

function session(): Store | undefined { try { return globalThis.sessionStorage } catch { return undefined } }
