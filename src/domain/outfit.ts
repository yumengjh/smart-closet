import { createUuid } from './id.ts'
import type { Garment } from '../services/api'

export const OUTFIT_WIDTH = 1080
export const OUTFIT_HEIGHT = 1350
export const OUTFIT_VERSION = 2

export type OutfitRole = 'TOP' | 'OUTER' | 'BOTTOM' | 'ONE_PIECE' | 'SHOES' | 'HAT' | 'BAG' | 'ACCESSORY' | 'OTHER'
export type OutfitCrop = { x: number; y: number; width: number; height: number }
export type OutfitElement = {
  elementId?: string
  kind?: 'GARMENT' | 'PERSON_PART'
  stickerId?: string
  stickerVersion?: number
  flipX?: boolean
  freeStretch?: boolean
  garmentId: string
  assetId: string
  role: OutfitRole
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  garmentLabel: string
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
  garmentRevision?: number
  assetUrl: string
  imageWidth: number
  imageHeight: number
  assetKind: string
  garmentStatus?: 'ACTIVE' | 'TRASHED' | 'DRAFT'
  garmentChanged?: boolean
  imageChanged?: boolean
}
export type OutfitScene = { version: number; elements: OutfitElement[] }
export type Outfit = { id: string; name: string; revision: number; createdAtMs: number; updatedAtMs: number; scene: OutfitScene }
export type OutfitDraft = { name: string; revision: number | null; scene: OutfitScene; savedAt?: number }
export type OutfitWriteElement = Omit<OutfitElement, 'assetUrl' | 'imageWidth' | 'imageHeight' | 'assetKind' | 'garmentRevision' | 'garmentStatus' | 'garmentChanged' | 'imageChanged'>
export type OutfitRoleOption = { value: OutfitRole; label: string }
export type OutfitLayerMove = 'forward' | 'backward' | 'front' | 'back'

export function outfitDropPosition(clientX: number, clientY: number, bounds: { left: number; top: number; width: number; height: number }) {
  if (bounds.width <= 0 || bounds.height <= 0) return null
  if (clientX < bounds.left || clientX > bounds.left + bounds.width || clientY < bounds.top || clientY > bounds.top + bounds.height) return null
  return { x: (clientX - bounds.left) / bounds.width * OUTFIT_WIDTH, y: (clientY - bounds.top) / bounds.height * OUTFIT_HEIGHT }
}

export function elementKey(item: OutfitElement) { return item.elementId || item.garmentId }

export function reorderOutfitElements(elements: OutfitElement[], garmentId: string, direction: OutfitLayerMove) {
  const index = elements.findIndex(item => elementKey(item) === garmentId)
  if (index < 0) return elements
  const target = direction === 'front' ? elements.length - 1 : direction === 'back' ? 0
    : Math.max(0, Math.min(elements.length - 1, index + (direction === 'forward' ? 1 : -1)))
  if (target === index) return elements
  const next = [...elements]
  const item = next.splice(index, 1)[0]
  next.splice(target, 0, item)
  return next.map((element, zIndex) => ({ ...element, zIndex }))
}

// The list is displayed top first; "above" inserts after the target in paint order.
export function dropOutfitLayer(elements: OutfitElement[], sourceId: string, targetId: string, above: boolean) {
  if (sourceId === targetId || !elements.some(item => elementKey(item) === sourceId) || !elements.some(item => elementKey(item) === targetId)) return elements
  const source = elements.find(item => elementKey(item) === sourceId)!
  const next = elements.filter(item => elementKey(item) !== sourceId)
  const target = next.findIndex(item => elementKey(item) === targetId)
  next.splice(target + (above ? 1 : 0), 0, source)
  if (next.every((item, index) => item === elements[index])) return elements
  return next.map((item, zIndex) => ({ ...item, zIndex }))
}

export const outfitRoleOptions: OutfitRoleOption[] = [
  { value: 'TOP', label: '上装' }, { value: 'OUTER', label: '外套' }, { value: 'BOTTOM', label: '下装' },
  { value: 'ONE_PIECE', label: '连体' }, { value: 'SHOES', label: '鞋' }, { value: 'HAT', label: '帽' },
  { value: 'BAG', label: '包' }, { value: 'ACCESSORY', label: '配饰' }, { value: 'OTHER', label: '其他' },
]

export function roleFromGarment(garment: Pick<Garment, 'category'>): OutfitRole {
  const name = garment.category.join(' ').trim()
  if (name === '裙装') return 'OTHER'
  if (/连衣裙|背心裙|吊带裙|连体|连身|\b(dress|jumpsuit|romper)\b/i.test(name)) return 'ONE_PIECE'
  if (/外套|夹克|西装外套|西装上衣|西服上衣|^西装$|大衣|风衣|羽绒|冲锋衣|罩衫|开衫|\b(coat|jacket|blazer|cardigan|parka)\b/i.test(name)) return 'OUTER'
  if (/长裤|短裤|牛仔裤|半身裙|下装|裤|裙|\b(pants|trousers|jeans|shorts|skirt)\b/i.test(name)) return 'BOTTOM'
  if (/T恤|衬衫|卫衣|毛衣|针织|背心|上装|马甲|Polo|\b(t-shirt|shirt|sweater|hoodie|sweatshirt|top|vest)\b/i.test(name)) return 'TOP'
  if (/鞋|靴|\b(shoes|boots|sneakers|sandals)\b/i.test(name)) return 'SHOES'
  if (/帽|\b(hat|cap|beret)\b/i.test(name)) return 'HAT'
  if (/背包|手提包|斜挎包|包袋|包|\b(bag|backpack|handbag)\b/i.test(name)) return 'BAG'
  if (/围巾|腰带|袜|首饰|眼镜|配饰|手套|领带|\b(scarf|belt|socks|jewelry|glasses|gloves|tie|accessory)\b/i.test(name)) return 'ACCESSORY'
  return 'OTHER'
}

export function formatGarmentLabel(garment: Pick<Garment, 'category' | 'primaryColor'>): string {
  return [garment.primaryColor[0], garment.category[0] || '衣物'].filter(Boolean).join(' ')
}

const defaultPositions: Record<OutfitRole, { x: number; y: number; width: number }> = {
  TOP: { x: 540, y: 340, width: 500 }, OUTER: { x: 540, y: 360, width: 480 },
  BOTTOM: { x: 540, y: 885, width: 430 }, ONE_PIECE: { x: 540, y: 690, width: 530 },
  SHOES: { x: 540, y: 1190, width: 330 }, HAT: { x: 205, y: 175, width: 230 },
  BAG: { x: 195, y: 1005, width: 275 }, ACCESSORY: { x: 880, y: 920, width: 210 }, OTHER: { x: 245, y: 620, width: 310 },
}

export function nextElementPosition(role: OutfitRole, current: OutfitElement[]): { x: number; y: number; width: number; height: number } {
  const base = defaultPositions[role]
  const siblings = current.filter((item) => item.role === role)
  const layer = siblings.length
  const spread = Math.min(base.width * 0.52, 280)
  const y = Math.max(70, Math.min(1278, base.y + 42 * layer))
  const width = Math.max(120, base.width * Math.pow(0.9, layer))
  const proposedX = base.x + (layer % 2 ? -1 : 1) * spread * Math.ceil(layer / 2)
  const x = Math.max(width / 2 + 16, Math.min(OUTFIT_WIDTH - width / 2 - 16, proposedX))
  return { x, y, width, height: width }
}

export function sceneWrite(scene: OutfitScene) {
  return {
    version: scene.version,
    elements: scene.elements.map(({ assetUrl: _assetUrl, imageWidth: _imageWidth, imageHeight: _imageHeight,
      assetKind: _assetKind, garmentRevision: _garmentRevision, garmentStatus: _garmentStatus,
      garmentChanged: _garmentChanged, imageChanged: _imageChanged, ...element }) => {
        if (scene.version === 1) return element
        if (element.kind === 'PERSON_PART') {
          const { garmentId: _garmentId, assetId: _assetId, ...person } = element
          return person
        }
        return element
      }),
  }
}

export function normalizeScene(scene: OutfitScene): OutfitScene {
  return {
    version: OUTFIT_VERSION,
    elements: [...scene.elements].sort((a, b) => a.zIndex - b.zIndex)
      .map((element, zIndex) => ({ ...element, elementId: elementKey(element), kind: element.kind || 'GARMENT', flipX: element.flipX || false, freeStretch: element.freeStretch || false, zIndex, rotation: ((element.rotation % 360) + 360) % 360 })),
  }
}

export function restoreOutfitDraft(outfit: Pick<Outfit, 'name' | 'revision' | 'scene'>, draft: OutfitDraft | null) {
  const valid = [1, OUTFIT_VERSION].includes(draft?.scene?.version || 0) && Array.isArray(draft?.scene.elements)
  if (!draft || !valid) return { name: outfit.name, scene: normalizeScene(outfit.scene), restored: false, conflict: false }
  return {
    name: draft.name,
    scene: normalizeScene(draft.scene),
    restored: true,
    conflict: draft.revision !== outfit.revision,
  }
}

export function stickerLimit(elements: OutfitElement[], kind: 'GARMENT' | 'PERSON_PART'): string | null {
  if (elements.length >= 64) return '画板最多放入 64 张贴纸。'
  if (kind === 'GARMENT' && elements.filter(item => item.kind !== 'PERSON_PART').length >= 32) return '画板最多放入 32 件衣物。'
  return null
}
export function copySticker(item: OutfitElement, zIndex: number): OutfitElement {
  return { ...item, elementId: createUuid(), x: Math.min(1080, item.x + 30), y: Math.min(1350, item.y + 30), zIndex }
}
