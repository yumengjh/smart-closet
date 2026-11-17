// 旧地址跳转（试穿与创作合并，server#271 第四节）：旧链接、书签与整理中心的历史记录仍能落到对的位置。
import { OUTFIT_EFFECT_ID } from '../creation/steps.ts'

export const TRY_PATH = '/try'
export const ALBUM_PATH = '/try/album'
// 与 vue-router 的 LocationQuery 同形，免得纯逻辑依赖路由库。
type Query = Record<string, string | null | (string | null)[] | undefined>
type Target = { path: string; query: Query }

const jobOf = (query: Query) => typeof query.job === 'string' && query.job ? query.job : ''
/** /creation（outfit、template、again 等参数原样带过去）→ /try。 */
export const legacyCreation = (query: Query): Target => ({ path: TRY_PATH, query: { ...query } })
/** /creation/works → /try/album。 */
export const legacyWorks = (query: Query): Target => ({ path: ALBUM_PATH, query: { ...query } })
/** /ootd?job= → 我的图里打开那张图（或它的状态）；其余 /ootd（含 outfit）→ /try 并预选上身图。 */
export function legacyOotd(query: Query): Target {
  const job = jobOf(query)
  if (job) return { path: ALBUM_PATH, query: { job } }
  return { path: TRY_PATH, query: { ...query, template: OUTFIT_EFFECT_ID } }
}
/** 整理中心等处指向某张上身图的链接。 */
export const albumJobHref = (id: string) => `${ALBUM_PATH}?job=${encodeURIComponent(id)}`
