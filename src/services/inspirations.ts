import { request } from './api'

/**
 * 穿搭灵感、合集、想穿与衣物标记（smart-closet-server docs/design/2026-11-23-穿搭灵感与个人沉淀：截图拆解、复刻与衣物标记设计.md，
 * 第一期 I1 + M1）。灵感原图只给本人看，不进分享、创作参考与生图；衣物标记不进模型。
 */
export type Inspiration = {
  id: string
  status: 'SAVED' | 'ANALYZING' | 'ANALYZED' | 'REJECTED' | 'FAILED'
  note: string | null
  width: number | null
  height: number | null
  imageUrl: string
  thumbUrl: string
  collectionIds: string[]
  createdAt: number
  updatedAt: number
}
export type InspirationPage = { items: Inspiration[]; nextCursor: string | null; total: number; max: number }
export type CollectionKind = 'OUTFIT' | 'INSPIRATION'
export type Collection = {
  id: string
  name: string
  sortOrder: number
  outfitCount: number
  inspirationCount: number
  coverThumbUrl: string | null
  createdAt: number
  updatedAt: number
}
export type GarmentMark = {
  garmentId: string
  tags: string[]
  note: string | null
  purchasePriceMinor: number | null
  purchaseCurrency: string | null
  purchaseDate: string | null
  wearCount: number
  lastWornOn: string | null
  updatedAt: number | null
}
export type GarmentMarkWrite = Pick<GarmentMark, 'tags' | 'note' | 'purchasePriceMinor' | 'purchaseCurrency' | 'purchaseDate'>

export { COLLECTION_SUGGESTIONS, MAX_COLLECTION_NAME, MAX_GARMENT_NOTE, MAX_INSPIRATION_NOTE, MAX_TAG_LENGTH, MAX_TAGS, costPerWear, minorToYuan, normalizeTags, yuanToMinor } from '../domain/marks'
import { normalizeTags } from '../domain/marks'

const json = (body: unknown) => JSON.stringify(body)

export const inspirationApi = {
  list: (params: { collection?: string; q?: string; cursor?: string | null; limit?: number } = {}) => {
    const query = new URLSearchParams()
    if (params.collection) query.set('collection', params.collection)
    if (params.q) query.set('q', params.q)
    if (params.cursor) query.set('cursor', params.cursor)
    if (params.limit) query.set('limit', String(params.limit))
    const text = query.toString()
    return request<InspirationPage>(`/api/inspirations${text ? `?${text}` : ''}`)
  },
  get: (id: string) => request<Inspiration>(`/api/inspirations/${encodeURIComponent(id)}`),
  upload: (file: Blob, note?: string) => {
    const form = new FormData()
    form.append('file', file, file instanceof File ? file.name : 'inspiration.png')
    if (note) form.append('note', note)
    return request<{ inspiration: Inspiration; duplicate: boolean }>('/api/inspirations', { method: 'POST', body: form })
  },
  updateNote: (id: string, note: string | null) => request<Inspiration>(`/api/inspirations/${encodeURIComponent(id)}`, { method: 'PATCH', body: json({ note }) }),
  remove: (id: string) => request<void>(`/api/inspirations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

export const collectionApi = {
  list: () => request<{ items: Collection[]; max: number }>('/api/collections'),
  create: (name: string) => request<Collection>('/api/collections', { method: 'POST', body: json({ name }) }),
  update: (id: string, patch: { name?: string; sortOrder?: number }) => request<Collection>(`/api/collections/${encodeURIComponent(id)}`, { method: 'PATCH', body: json(patch) }),
  remove: (id: string) => request<void>(`/api/collections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  add: (id: string, kind: CollectionKind, refId: string) => request<void>(`/api/collections/${encodeURIComponent(id)}/items`, { method: 'PUT', body: json({ kind, refId }) }),
  removeItem: (id: string, kind: CollectionKind, refId: string) => request<void>(`/api/collections/${encodeURIComponent(id)}/items/${kind}/${encodeURIComponent(refId)}`, { method: 'DELETE' }),
}

export const outfitMarkApi = {
  setFavorite: (id: string, favorite: boolean) => request<{ id: string; favorite: boolean }>(`/api/outfits/${encodeURIComponent(id)}/favorite`, { method: 'PATCH', body: json({ favorite }) }),
}

export const garmentMarkApi = {
  get: (id: string) => request<GarmentMark>(`/api/garments/${encodeURIComponent(id)}/mark`),
  save: (id: string, mark: GarmentMarkWrite) => request<GarmentMark>(`/api/garments/${encodeURIComponent(id)}/mark`, { method: 'PUT', body: json({ ...mark, tags: normalizeTags(mark.tags) }) }),
  batch: (ids: string[]) => ids.length ? request<{ items: { garmentId: string; tags: string[] }[] }>(`/api/garments/marks?ids=${ids.slice(0, 200).map(encodeURIComponent).join(',')}`) : Promise.resolve({ items: [] }),
  tags: () => request<{ items: { name: string; count: number }[] }>('/api/garments/tags'),
}
