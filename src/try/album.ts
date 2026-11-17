// “我的图”（/try/album，server#271 3.2）的纯逻辑：上身图与作品按时间混排、按来源筛选。
// 上身图全量（/api/ootd/jobs），作品按页加载，混排以已加载的范围为准。
import type { CreationJob } from '../creation/types'
import type { RenderJob } from '../services/platform'
import { liveCreation } from '../creation/model.ts'

export type AlbumFilter = 'all' | 'ootd' | 'work'
export type AlbumTile = { kind: 'ootd'; id: string; at: number; job: RenderJob } | { kind: 'work'; id: string; at: number; job: CreationJob }
export type WorkBucket = 'done' | 'running' | 'failed' | 'hidden'

/** 作品分到哪一组：有图的是完成，进行中与“等待功能恢复”算进行中，其余没有图的进失败区；已删除的不显示。 */
export function workBucket(job: Pick<CreationJob, 'status' | 'waitReason' | 'mediaUrl'>): WorkBucket {
  if (job.status === 'DELETED') return 'hidden'
  if (job.status === 'SUCCEEDED' && job.mediaUrl) return 'done'
  if (liveCreation(job) || job.status === 'QUEUED') return 'running'
  return 'failed'
}

/** 新的在前；同一编号只留一份（第一页刷新与“更早的作品”可能重叠，以先出现的为准）。 */
export function albumTiles(ootd: RenderJob[], works: CreationJob[], filter: AlbumFilter): AlbumTile[] {
  const seen = new Set<string>(), tiles: AlbumTile[] = []
  if (filter !== 'work') for (const job of ootd) if (!seen.has(`o:${job.id}`)) { seen.add(`o:${job.id}`); tiles.push({ kind: 'ootd', id: job.id, at: job.createdAt, job }) }
  if (filter !== 'ootd') for (const job of works) if (!seen.has(`w:${job.id}`)) { seen.add(`w:${job.id}`); tiles.push({ kind: 'work', id: job.id, at: job.createdAtMs, job }) }
  return tiles.sort((a, b) => b.at - a.at)
}

/** 合并两份作品列表（第一页 + 更早的页），去掉重复编号，保持先到先得。 */
export function mergeWorks(...lists: CreationJob[][]): CreationJob[] {
  const seen = new Set<string>()
  return lists.flat().filter(job => !seen.has(job.id) && Boolean(seen.add(job.id)))
}

