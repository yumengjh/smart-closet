import type { Selection } from './api'

/** 已选衣物的一枚小图：名字、缩略图，以及点击移除时交回 toggle 的原始选择。 */
export type SelectedChip = { id: string; name: string; image?: string; selection: Selection }
