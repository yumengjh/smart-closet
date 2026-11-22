import type { Look, Selection } from './api'

/** 已选衣物的一枚小图：名字、缩略图，以及点击移除时交回 toggle 的原始选择。 */
export type SelectedChip = { id: string; name: string; image?: string; selection: Selection }

/**
 * 精选整套与其他选择互斥（server 设计 2026-11-22 3.4：选了 LOOK 时整次准备只能有这一个选择）。
 * dropped 说明这次顺手换下了什么，页面据此给一句轻提示；null 表示没有换下别的。
 */
export type SelectionChange = { selected: Selection[]; dropped: 'look' | 'others' | null }
export const isLook = (s: Selection) => s.type === 'LOOK'
export const hasLook = (selected: readonly Selection[]) => selected.some(isLook)

/** 点一下：已选就取消；选精选会换下其他衣服，选其他衣服会换下精选。 */
export function toggleSelection(selected: readonly Selection[], item: Selection): SelectionChange {
  if (selected.some(s => s.id === item.id && s.type === item.type)) return { selected: selected.filter(s => !(s.id === item.id && s.type === item.type)), dropped: null }
  return addSelection(selected, item)
}

/** 只加不取消（例如刚上传的临时衣物），同样遵守互斥。 */
export function addSelection(selected: readonly Selection[], item: Selection): SelectionChange {
  if (isLook(item)) return { selected: [item], dropped: selected.some(s => !isLook(s)) ? 'others' : null }
  if (hasLook(selected)) return { selected: [item], dropped: 'look' }
  return { selected: [...selected, item], dropped: null }
}

/** 换下时说的那一句。 */
export function droppedHint(dropped: SelectionChange['dropped']) {
  return dropped === 'others' ? '精选整套要单独试，已换下其他衣服' : dropped === 'look' ? '已换下精选整套' : ''
}

/** 埋点 try_live_start 的 source：从精选、搭配、临时上传还是衣柜开始。 */
export type LiveSource = 'wardrobe' | 'outfit' | 'look' | 'upload'
export function liveSource(selected: readonly Selection[], outfitChosen: boolean): LiveSource {
  if (hasLook(selected)) return 'look'
  if (outfitChosen) return 'outfit'
  if (selected.some(s => s.type === 'TEMPORARY')) return 'upload'
  return 'wardrobe'
}

export const LOOK_TAB = '精选'
/** 选衣面板的标签：没有精选时不显示“精选”。 */
export function pickerTabs(hasLooks: boolean) {
  return hasLooks ? [LOOK_TAB, '衣柜', '已存搭配', '临时上传'] : ['衣柜', '已存搭配', '临时上传']
}
/** 默认停在哪个标签：点名精选的停“精选”；从衣柜卡片或搭配进来的照旧；其余有精选时停“精选”。 */
export function initialPickerTab(from: { looks: number; look?: boolean; garment?: boolean; outfit?: boolean }) {
  if (from.look && from.looks > 0) return LOOK_TAB
  if (from.outfit) return '已存搭配'
  if (from.garment) return '衣柜'
  return from.looks > 0 ? LOOK_TAB : '衣柜'
}

/** 镜头里左右滑动换同一分类的下一套 / 上一套，首尾相接；分类里只有这一套时返回 null。 */
export function neighborLook(looks: readonly Look[], currentId: string, direction: 'next' | 'prev'): Look | null {
  const current = looks.find(l => l.id === currentId)
  if (!current) return null
  const same = looks.filter(l => l.category === current.category)
  if (same.length < 2) return null
  const index = same.indexOf(current)
  return same[(index + (direction === 'next' ? 1 : same.length - 1)) % same.length]
}

/** 首次滑动换衣的提示只说一次，记在本机；存储不可用时每次进页面最多说一次。 */
export const SWIPE_TIP_KEY = 'yuda.tryon.look-swipe-tip'
