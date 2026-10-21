import { request } from './api'

/** 预设衣物库（docs/design/2026-10-21-预设衣物库设计.md）：用户浏览并复制进衣柜，管理员导入、上架与看覆盖。 */
export type PresetItem = { id: string; displayAssetId: string; displayUrl: string; name: string | null; fields: Record<string, string[]>; gender: string | null; styles: string[]; seasons: string[]; alreadyImported: boolean; /** 由你自己衣柜里的这件衣物做成，不能再加一遍。 */ ownSource?: boolean }
export type PresetStatus = 'DRAFT' | 'LISTED' | 'UNLISTED'
export type AdminPreset = Omit<PresetItem, 'alreadyImported' | 'ownSource'> & { sourceGarmentId: string; sourceOwner: string; status: PresetStatus; sort: number; createdAtMs: number; updatedAtMs: number }
export type PresetCoverage = { gender: string; role: string; style: string; count: number; missing: boolean }

import { presetQuery, type PresetFilter } from './presetGroups'
export { groupPresets, presetGroup, presetName, presetQuery, PRESET_GROUPS, type PresetGroup, type PresetFilter } from './presetGroups'

export const presetApi = {
  list: (filter: PresetFilter = {}) => request<PresetItem[]>(`/api/presets${presetQuery(filter)}`),
  importInto: (ids: string[]) => request<{ garmentIds: string[]; skipped: string[] }>('/api/presets/import', { method: 'POST', body: JSON.stringify({ ids }) }),
  adminImport: (username: string) => request<AdminPreset[]>('/api/admin/presets/import', { method: 'POST', body: JSON.stringify({ username }) }),
  adminList: (status?: PresetStatus) => request<AdminPreset[]>(`/api/admin/presets${status ? `?status=${status}` : ''}`),
  adminEdit: (id: string, patch: Partial<Pick<AdminPreset, 'status' | 'gender' | 'styles' | 'seasons' | 'sort'>>) => request<AdminPreset>(`/api/admin/presets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  coverage: () => request<PresetCoverage[]>('/api/admin/presets/coverage'),
}
