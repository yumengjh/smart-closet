// 种草（smart-closet-server#197，docs/design/2026-11-04-种草衣物：暂未拥有标记设计.md）：网上看中、还没买的衣服存进衣柜，状态 WANTED。
// 显示名称默认“种草”，用户可在「我的 → 外观」里自定义；这里只缓存一份，所有页面共用同一个 ref。
import { ref } from 'vue'
import { closetApi, type Garment } from '../services/api'

export const DEFAULT_WANTED_LABEL = '种草'
export const WANTED_LABEL_MAX = 6
export const wantedLabel = ref(DEFAULT_WANTED_LABEL)
let loading: Promise<void> | null = null

/** Loads the account's label once per page session; failures keep the default. */
export function loadWantedLabel(force = false) {
  if (loading && !force) return loading
  loading = closetApi.preferences().then(view => { wantedLabel.value = view.wantedLabel || DEFAULT_WANTED_LABEL }).catch(() => { /* keep the default */ })
  return loading
}

export async function saveWantedLabel(value: string) {
  const view = await closetApi.savePreferences({ wantedLabel: value.trim() })
  wantedLabel.value = view.wantedLabel || DEFAULT_WANTED_LABEL
  return view
}

export const isWanted = (garment: Pick<Garment, 'status'>) => garment.status === 'WANTED'

/** 衣柜顶部的“全部 / 已拥有 / 种草”，本机记住。 */
export type Ownership = 'ALL' | 'OWNED' | 'WANTED'
const OWNERSHIP_KEY = 'yuda.wardrobe-ownership.v1'
export function readOwnership(): Ownership {
  try { const saved = localStorage.getItem(OWNERSHIP_KEY); return saved === 'OWNED' || saved === 'WANTED' ? saved : 'ALL' } catch { return 'ALL' }
}
export function saveOwnership(value: Ownership) { try { localStorage.setItem(OWNERSHIP_KEY, value) } catch { /* storage blocked */ } }
export const listStatus = (value: Ownership) => value === 'OWNED' ? 'ACTIVE' as const : value === 'WANTED' ? 'WANTED' as const : 'ACTIVE,WANTED' as const
