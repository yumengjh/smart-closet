import type { OutfitElement } from './outfit'

export type PersonPart = { id: string; label: string; version: number; width: number; height: number; url: string; loose: boolean }
export type PersonSet = { id: string; label: string; version: number; parts: PersonPart[] }
export type PersonCatalog = { version: number; sets: PersonSet[] }

export function createPersonElement(part: PersonPart, count: number, position = { x: 540, y: 675 }): OutfitElement {
  const height = Math.min(400, Math.max(100, part.height))
  const width = Math.max(24, height * part.width / part.height)
  return {
    elementId: crypto.randomUUID(), kind: 'PERSON_PART', stickerId: part.id, stickerVersion: part.version,
    garmentId: '', assetId: '', role: 'OTHER', garmentLabel: part.label,
    ...position, width, height, rotation: 0, zIndex: count, flipX: false, freeStretch: false,
    cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1,
    assetUrl: part.url, imageWidth: part.width, imageHeight: part.height, assetKind: 'PERSON_PART',
  }
}
