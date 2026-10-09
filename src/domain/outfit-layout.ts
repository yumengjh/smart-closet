import { normalizeScene, type OutfitElement, type OutfitScene } from './outfit.ts'

// Paint body garments first and outerwear above them, independently of selection order.
export function orderOutfitLayers(scene: OutfitScene): OutfitScene {
  const order: Record<string, number> = { BOTTOM: 1, ONE_PIECE: 2, TOP: 3, OUTER: 4, SHOES: 5, HAT: 6, BAG: 7, ACCESSORY: 8, OTHER: 9 }
  // A one-piece next to a top is a pinafore (背带裙/JSK) worn over that top.
  const roles = new Set(scene.elements.filter(item => item.kind !== 'PERSON_PART').map(item => item.role))
  if (roles.has('TOP') && roles.has('ONE_PIECE')) order.ONE_PIECE = 3.5
  const items = [...scene.elements].sort((a, b) => (a.kind === 'PERSON_PART' ? 0 : order[a.role] || 9) - (b.kind === 'PERSON_PART' ? 0 : order[b.role] || 9))
  return normalizeScene({ ...scene, elements: items.map((item, zIndex) => ({ ...item, zIndex })) })
}

// All positions use the existing 1080 × 1350 board coordinates.
export function arrangeOutfit(scene: OutfitScene): OutfitScene {
  const items = scene.elements.map(item => ({ ...item }))
  const garments = items.filter(item => item.kind !== 'PERSON_PART')
  const first = (role: string) => garments.find(item => item.role === role)
  const top = first('TOP'), bottom = first('BOTTOM'), whole = first('ONE_PIECE'), shoes = first('SHOES'), outer = first('OUTER')
  const widths: Record<string, number> = { TOP: 500, BOTTOM: 400, ONE_PIECE: 510, OUTER: 360, SHOES: 240, HAT: 200, BAG: 230, ACCESSORY: 180, OTHER: 210 }
  for (const item of garments) {
    const aspect = item.imageWidth && item.imageHeight
      ? item.imageWidth * item.cropWidth / Math.max(1, item.imageHeight * item.cropHeight)
      : item.width / Math.max(1, item.height)
    item.width = widths[item.role] || 210
    item.height = item.width / Math.max(.15, Math.min(5, aspect))
    item.rotation = 0; item.freeStretch = false
  }
  // A pinafore (one-piece together with a top) overlaps the upper half of its top instead of replacing it.
  const pinafore = !!(whole && top)
  const body = pinafore ? [top!, whole!] : whole ? [whole] : [top, bottom].filter((item): item is OutfitElement => !!item)
  if (!body.length && outer) body.push(outer)
  // A collage shows separate garments, not a fitted virtual try-on: keep opaque outerwear beside the body.
  const bodyX = outer && !body.includes(outer) ? 340 : 540
  const overlap = pinafore ? Math.round(top!.height * 0.55) : body.length > 1 ? 22 : 0
  const naturalHeight = body.reduce((sum, item) => sum + item.height, 0) - overlap + (shoes?.height || 0) + (shoes ? 10 : 0)
  const scale = Math.min(1, 1090 / Math.max(1, naturalHeight))
  for (const item of garments) { item.width *= scale; item.height *= scale }
  let edge = Math.max(155, (1350 - naturalHeight * scale) / 2)
  const shoulder = edge
  for (const item of body) { item.x = bodyX; item.y = edge + item.height / 2; edge += item.height - overlap * scale }
  if (shoes) { shoes.x = bodyX; shoes.y = Math.min(1315 - shoes.height / 2, edge + overlap * scale + 10 + shoes.height / 2) }
  if (outer && !body.includes(outer)) { outer.x = 820; outer.y = shoulder + outer.height / 2 }
  const worn = new Set([...body, shoes, outer].filter(Boolean))
  let side = 0
  for (const item of garments) {
    if (worn.has(item)) continue
    if (item.role === 'HAT' && item === first('HAT')) { item.x = bodyX; item.y = Math.max(item.height / 2 + 20, shoulder - item.height / 2 - 12) }
    else { item.x = side % 2 ? 875 : 190; item.y = 350 + Math.floor(side / 2) * 245; side++ }
  }
  for (const item of garments) {
    const fit = Math.min(1, 1040 / item.width, 1300 / item.height)
    item.width *= fit; item.height *= fit
    item.x = Math.max(item.width / 2 + 16, Math.min(1064 - item.width / 2, item.x))
    item.y = Math.max(item.height / 2 + 16, Math.min(1334 - item.height / 2, item.y))
  }
  return orderOutfitLayers({ ...scene, elements: items })
}
