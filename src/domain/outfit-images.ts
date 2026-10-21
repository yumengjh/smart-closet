import { createUuid } from './id'
import type { Garment } from '../services/api'
import { mediaUrl, isApiMedia } from '../services/urls'
import type { OutfitElement, OutfitRole } from './outfit'
import { formatGarmentLabel, nextElementPosition, OUTFIT_HEIGHT, OUTFIT_WIDTH, roleFromGarment } from './outfit'

const imagePromises = new Map<string, Promise<HTMLImageElement>>()

export type GarmentArtwork = { assetId: string; url: string; kind: string; hasBackground: boolean }

function mockArtwork(garment: Garment, role: OutfitRole): string {
  const color = /^#[0-9a-f]{6}$/i.test(garment.imageColor || '') ? garment.imageColor : '#b9b9b3'
  const silhouette = role === 'BOTTOM'
    ? '<path d="M28 12h44l-5 75-12 1-5-44-5 44-12-1z"/>'
    : role === 'HAT'
      ? '<path d="M22 57c6-26 50-26 56 0H22zm-9 0h74v9H13z"/>'
      : role === 'SHOES'
        ? '<path d="M17 57c20 0 26-17 27-28h13c2 17 8 24 25 25 6 1 9 6 9 13H16z"/>'
        : '<path d="m30 17 12-7c3 8 7 12 12 12s9-4 12-12l12 7 15 13-10 20-8-5 4 41c-14 5-37 5-51 0l4-41-8 5-10-20z"/>'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="100" viewBox="0 0 110 100"><path d="${silhouette.slice(silhouette.indexOf('d="') + 3, silhouette.indexOf('"', silhouette.indexOf('d="') + 3))}" fill="${color}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function artworkForGarment(garment: Garment): GarmentArtwork {
  const approved = garment.images.filter((image) => image.reviewStatus === 'APPROVED')
  const transparent = approved.find((image) => ['SEGMENT', 'ENSURE_TRANSPARENCY'].includes(image.kind))
  if (transparent) return { assetId: transparent.id, url: transparent.url, kind: transparent.kind, hasBackground: false }
  const sticker = approved.find((image) => image.kind === 'STICKER')
  if (sticker) return { assetId: sticker.id, url: sticker.url, kind: sticker.kind, hasBackground: false }
  const shown = garment.images.find((image) => image.id === garment.displayAssetId)
  if (shown?.url) return { assetId: shown.id, url: shown.url, kind: shown.kind, hasBackground: ['INPUT', 'GENERATE'].includes(shown.kind) }
  if (garment.displayUrl) return { assetId: garment.displayAssetId, url: garment.displayUrl, kind: 'DISPLAY', hasBackground: true }
  if (garment.sourceUrl) return { assetId: garment.sourceAssetId || `source-${garment.id}`, url: garment.sourceUrl, kind: 'INPUT', hasBackground: true }
  return { assetId: `mock-${garment.id}`, url: mockArtwork(garment, roleFromGarment(garment)), kind: 'MOCK', hasBackground: false }
}

export function loadOutfitImage(url: string): Promise<HTMLImageElement> {
  const cached = imagePromises.get(url)
  if (cached) return cached
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = isApiMedia(url) ? 'use-credentials' : 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('贴纸图片暂时无法加载，请重试。'))
    image.src = mediaUrl(url)!
  })
  imagePromises.set(url, promise)
  promise.catch(() => imagePromises.delete(url))
  return promise
}

type Bounds = { x: number; y: number; width: number; height: number }
const boundsCache = new WeakMap<HTMLImageElement, Bounds>()
/** Scanning a full-size picture's pixels is slow, so each loaded image is measured only once. */
export function transparentBounds(image: HTMLImageElement): Bounds {
  const hit = boundsCache.get(image); if (hit) return hit
  const bounds = measureBounds(image); boundsCache.set(image, bounds); return bounds
}
function measureBounds(image: HTMLImageElement): Bounds {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return { x: 0, y: 0, width: 1, height: 1 }
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1
    for (let y = 0; y < canvas.height; y += 2) for (let x = 0; x < canvas.width; x += 2) {
      if (data[(y * canvas.width + x) * 4 + 3] > 12) {
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
      }
    }
    if (right < left || bottom < top) return { x: 0, y: 0, width: 1, height: 1 }
    const insetX = Math.min(left, canvas.width - right - 1) / canvas.width
    const insetY = Math.min(top, canvas.height - bottom - 1) / canvas.height
    const x = Math.max(0, left / canvas.width - insetX * 0.012)
    const y = Math.max(0, top / canvas.height - insetY * 0.012)
    return {
      x, y,
      width: Math.min(1 - x, (right + 1) / canvas.width - x + insetX * 0.012),
      height: Math.min(1 - y, (bottom + 1) / canvas.height - y + insetY * 0.012),
    }
  } catch {
    return { x: 0, y: 0, width: 1, height: 1 }
  }
}

export async function createOutfitElement(garment: Garment, current: OutfitElement[]): Promise<OutfitElement> {
  const role = roleFromGarment(garment)
  const artwork = artworkForGarment(garment)
  const image = await loadOutfitImage(artwork.url)
  const crop = transparentBounds(image)
  const position = nextElementPosition(role, current)
  const aspect = (image.naturalWidth * crop.width) / Math.max(1, image.naturalHeight * crop.height)
  const width = position.width
  const height = Math.max(80, Math.min(1260, width / Math.max(0.32, Math.min(2.6, aspect))))
  const x = Math.max(width / 2 + 16, Math.min(OUTFIT_WIDTH - width / 2 - 16, position.x))
  const y = Math.max(height / 2 + 16, Math.min(OUTFIT_HEIGHT - height / 2 - 16, position.y))
  return {
    elementId: createUuid(), kind: 'GARMENT', flipX: false, freeStretch: false,
    garmentId: garment.id, assetId: artwork.assetId, role,
    x, y, width, height, rotation: 0, zIndex: current.length,
    garmentLabel: formatGarmentLabel(garment), cropX: crop.x, cropY: crop.y,
    cropWidth: crop.width, cropHeight: crop.height,
    garmentRevision: garment.revision, assetUrl: artwork.url, imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight, assetKind: artwork.kind, garmentStatus: 'ACTIVE',
    garmentChanged: false, imageChanged: false,
  }
}

/** {@code background} is white for exports; on-screen previews pass the theme's board colour (the exported image never follows the theme). */
export async function drawOutfit(scene: { elements: OutfitElement[] }, width: number, height: number, background = '#fff'): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法导出画板，请重试。')
  context.fillStyle = background; context.fillRect(0, 0, width, height)
  // Large garment pictures are scaled down a lot for thumbnails; high-quality smoothing keeps edges crisp (issue #4).
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
  const scaleX = width / 1080, scaleY = height / 1350
  const layers = [...scene.elements].sort((a, b) => a.zIndex - b.zIndex)
  const images = await Promise.all(layers.map((element) => loadOutfitImage(element.assetUrl)))
  layers.forEach((element, index) => {
    const image = images[index]
    const sw = Math.max(1, image.naturalWidth * element.cropWidth)
    const sh = Math.max(1, image.naturalHeight * element.cropHeight)
    context.save()
    context.translate(element.x * scaleX, element.y * scaleY)
    context.rotate(element.rotation * Math.PI / 180)
    context.scale(element.flipX ? -1 : 1, 1)
    context.drawImage(image, element.cropX * image.naturalWidth, element.cropY * image.naturalHeight,
      sw, sh, -element.width * scaleX / 2, -element.height * scaleY / 2,
      element.width * scaleX, element.height * scaleY)
    context.restore()
  })
  return canvas
}

export async function downloadOutfitPng(scene: { elements: OutfitElement[] }, name: string) {
  const canvas = await drawOutfit(scene, 1080, 1350)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('画板导出失败，请重试。')), 'image/png'))
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = `${name.trim().replace(/[\\/:*?"<>|]/g, '_') || '我的穿搭'}.png`
  anchor.click()
  URL.revokeObjectURL(url)
}
