import { mediaUrl, isApiMedia } from '../services/urls'
import { analyzeAlpha, type Geometry } from './geometry'

export type Texture = { canvas: HTMLCanvasElement; geometry: Geometry }
export async function loadTexture(url: string): Promise<Texture> {
  const img = new Image()
  img.crossOrigin = isApiMedia(url) ? 'use-credentials' : 'anonymous'
  img.src = mediaUrl(url) || url
  await img.decode()
  const scan = document.createElement('canvas')
  const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight))
  scan.width = Math.max(1, Math.round(img.naturalWidth * scale)); scan.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = scan.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, scan.width, scan.height)
  const pixels = ctx.getImageData(0, 0, scan.width, scan.height).data
  let left = scan.width, right = 0, top = scan.height, bottom = 0
  for (let y = 0; y < scan.height; y++) for (let x = 0; x < scan.width; x++) if (pixels[(y * scan.width + x) * 4 + 3]! > 20) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  if (right <= left || bottom <= top) throw new Error('素材中没有可见衣物。')
  const canvas = document.createElement('canvas')
  canvas.width = right - left + 1; canvas.height = bottom - top + 1
  const output = canvas.getContext('2d', { willReadFrequently: true })!
  output.drawImage(scan, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
  return { canvas, geometry: analyzeAlpha(output.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height) }
}

/** A left-right flipped copy, so printed text reads correctly in a mirrored preview. */
export function flippedCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width; canvas.height = source.height
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1); ctx.drawImage(source, 0, 0)
  return canvas
}
