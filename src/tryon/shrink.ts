/**
 * 临时衣物在浏览器里先缩小再上传（smart-closet-server docs/design/2026-11-06-实时试穿加载提速与网络提示设计.md §3.1）。
 * 参考拼图每件衣物只占 512 px 的格子，长边 1024 px 已有两倍余量；不透明的照片转 JPEG，带透明的抠图保留 PNG。
 * 任何一步失败都退回原文件，由服务端照旧校验。只用于“仅当前页面试穿”，入柜流程仍交原文件。
 */
export const SHRINK_SIDE = 1024
export const JPEG_QUALITY = 0.88
const KEEP_TYPES = new Set(['image/jpeg', 'image/png'])

/** 长边不超过 max，不放大；至少 1 像素。 */
export function targetSize(width: number, height: number, max = SHRINK_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale }
}

/** 原文件已经够小且是服务端认得的格式时，不重新编码（重新编码只会更糊）。 */
export function canKeepOriginal(type: string, width: number, height: number, max = SHRINK_SIDE) {
  return KEEP_TYPES.has(type) && Math.max(width, height) <= max
}

/** RGBA 字节里是否有明显透明的像素（alpha < 250），按步长抽样。 */
export function hasTransparency(rgba: ArrayLike<number>, step = 1) {
  for (let i = 3; i < rgba.length; i += 4 * Math.max(1, step)) if (rgba[i] < 250) return true
  return false
}

/** 压缩后反而更大时用原文件（服务端只认 JPEG/PNG，其他格式只能用压缩结果）。 */
export function preferShrunk(originalType: string, originalBytes: number, shrunkBytes: number) {
  return !KEEP_TYPES.has(originalType) || shrunkBytes < originalBytes
}

export type Shrunk = { file: File; before: number; after: number; width: number; height: number; changed: boolean }

function renamed(name: string, type: string) {
  const base = name.replace(/\.[^.]+$/, '') || 'garment'
  return `${base}.${type === 'image/png' ? 'png' : 'jpg'}`
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch { /* 部分浏览器不支持该格式或选项，退回 <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (cause) { URL.revokeObjectURL(url); throw cause }
}

function encode(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, type === 'image/jpeg' ? JPEG_QUALITY : undefined))
}

/** 缩到长边 1024 px；失败或不划算时原样返回。 */
export async function shrinkImage(file: File, max = SHRINK_SIDE): Promise<Shrunk> {
  const original: Shrunk = { file, before: file.size, after: file.size, width: 0, height: 0, changed: false }
  let decoded: Awaited<ReturnType<typeof decode>> | undefined
  try {
    decoded = await decode(file)
    const { width, height } = targetSize(decoded.width, decoded.height, max)
    if (canKeepOriginal(file.type, decoded.width, decoded.height, max)) return { ...original, width, height }
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return original
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
    context.drawImage(decoded.source, 0, 0, width, height)
    // 抽样约 4 万个像素判断透明，足够发现抠图的透明底。
    const pixels = context.getImageData(0, 0, width, height).data
    const transparent = hasTransparency(pixels, Math.max(1, Math.floor((width * height) / 40_000)))
    let type = transparent ? 'image/png' : 'image/jpeg'
    if (!transparent) { context.globalCompositeOperation = 'destination-over'; context.fillStyle = '#fff'; context.fillRect(0, 0, width, height) }
    const blob = await encode(canvas, type)
    if (!blob || !KEEP_TYPES.has(blob.type)) return original
    type = blob.type
    if (!preferShrunk(file.type, file.size, blob.size)) return { ...original, width: decoded.width, height: decoded.height }
    return { file: new File([blob], renamed(file.name, type), { type, lastModified: Date.now() }), before: file.size, after: blob.size, width, height, changed: true }
  } catch { return original }
  finally { decoded?.close() }
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
