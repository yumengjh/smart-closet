import { request } from '../services/api'

/** Mirrors SimilarGarments on the server (design 相似衣物提示与以图搜图). All scores are computed locally, no model calls. */
export type SimilarLevel = 'DUPLICATE' | 'VERY_SIMILAR' | 'SIMILAR'
export type SimilarItem = { id: string; name: string; status: string; displayUrl: string | null; level: SimilarLevel | null; score: number; parts: Record<string, number>; reasons: string[] }
export type SimilarView = { items: SimilarItem[]; ready: { text: boolean; image: boolean } }
export type DuplicatePair = { a: SimilarItem; b: SimilarItem; level: SimilarLevel; score: number; reasons: string[] }
export type ImageSearch = { items: SimilarItem[]; matting: string; note: string }

export const LEVEL_LABELS: Record<SimilarLevel, { label: string; color: string }> = {
  DUPLICATE: { label: '可能重复', color: 'orange' }, VERY_SIMILAR: { label: '非常像', color: 'blue' }, SIMILAR: { label: '相似', color: 'default' },
}
export const PART_LABELS: Record<string, string> = { text: '描述', color: '颜色', shape: '轮廓', look: '外观', fields: '字段' }

export const similarApi = {
  similar: (id: string, limit = 5) => request<SimilarView>(`/api/garments/${id}/similar?limit=${limit}`),
  duplicates: () => request<{ items: DuplicatePair[] }>('/api/garments/duplicates'),
  flags: (ids: string[]) => ids.length ? request<{ flags: Record<string, SimilarItem> }>('/api/garments/similar-flags?' + ids.map(id => `ids=${encodeURIComponent(id)}`).join('&')) : Promise.resolve({ flags: {} }),
  dismiss: (a: string, b: string) => request<{ ok: boolean }>('/api/garments/similar-dismissals', { method: 'POST', body: JSON.stringify({ garmentA: a, garmentB: b }) }),
  searchByImage: (file: File, role?: string) => {
    const form = new FormData(); form.append('image', file)
    return request<ImageSearch>('/api/garments/search-by-image' + (role ? `?role=${role}` : ''), { method: 'POST', body: form })
  },
}
