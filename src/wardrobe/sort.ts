// 衣柜排序：选择保存在本机浏览器，换设备不同步；服务端按所选顺序分页，所以翻页时顺序一致。
export const SORT_OPTIONS = [
  { value: 'updated', label: '最近更新' },
  { value: 'created', label: '最近添加' },
  { value: 'created_asc', label: '最早添加' },
  { value: 'favorite', label: '收藏优先' },
  { value: 'category', label: '按品类' },
  { value: 'color', label: '按颜色' },
  { value: 'name', label: '按名称' },
] as const
export const DEFAULT_SORT = 'updated'
const KEY = 'yixu.wardrobe-sort.v1'
const valid = (value: string | null): value is string => SORT_OPTIONS.some(option => option.value === value)
export function readSort() { try { const value = localStorage.getItem(KEY); return valid(value) ? value : DEFAULT_SORT } catch { return DEFAULT_SORT } }
export function saveSort(value: string) { try { localStorage.setItem(KEY, value) } catch { /* storage blocked */ } }
export const sortLabel = (value: string) => SORT_OPTIONS.find(option => option.value === value)?.label || '最近更新'
