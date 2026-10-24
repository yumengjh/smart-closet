// 从哪里进入衣物详情（待核对页等）：详情页返回、上一件/下一件都回到来源，而不是一律回衣柜。
// 来源写在地址里（?from=review），所以刷新和分享链接都不丢；那一页的衣物顺序只存在本标签页的 sessionStorage。
type Store = Pick<Storage, 'getItem' | 'setItem'>
const KEY = 'yixu.review-ids.v1'
export const MAX_IDS = 200
export const REVIEW_FROM = 'review'

/** The garment's address when opened from the review page. */
export const fromReviewLink = (id: string) => ({ path: `/garment/${id}`, query: { from: REVIEW_FROM } })

export function saveReviewIds(ids: string[], store: Store | undefined = session()) {
  try { store?.setItem(KEY, JSON.stringify(ids.slice(0, MAX_IDS))) } catch { /* storage blocked */ }
}
export function readReviewIds(store: Store | undefined = session()): string[] {
  try {
    const parsed = JSON.parse(store?.getItem(KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id.length <= 64).slice(0, MAX_IDS) : []
  } catch { return [] }
}
function session(): Store | undefined { try { return globalThis.sessionStorage } catch { return undefined } }
