/**
 * Garment and processing images come in smaller copies (`?w=`): the server scales them to one of these widths and
 * sends WebP when the browser accepts it. Lists and previews use a copy; downloads, "view original" and the outfit
 * canvas keep the original file.
 */
export const VARIANT_WIDTHS = [160, 320, 480, 720, 960] as const

const RESIZABLE = /^\/api\/(?:workflows\/[^/?#]+\/files\/[^/?#]+|batches\/[^/?#]+\/files\/[^/?#]+|segmentations\/[^/?#]+\/(?:files\/[^/?#]+|sticker\/image))$/

/** Same path with `?w=` when the server can resize it; anything else (blob:, data:, private photos) stays as it is. */
export function variantPath<T extends string | null | undefined>(path: T, width: number): T {
  if (!path || !RESIZABLE.test(path)) return path
  const snapped = VARIANT_WIDTHS.find(allowed => width <= allowed) ?? VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1]
  return `${path}?w=${snapped}` as T
}

/** `srcset` of copies for the given widths, or undefined when the path has no copies. */
export function variantSrcset(path: string | null | undefined, widths: readonly number[], resolve: (path: string) => string = p => p): string | undefined {
  if (!path || !RESIZABLE.test(path)) return undefined
  return widths.map(width => `${resolve(variantPath(path, width))} ${width}w`).join(', ')
}

/**
 * Copy for one layer of an outfit preview: the layer shows `cropWidth` (0–1) of its picture across `drawnWidth` canvas
 * pixels, so the whole picture is needed at drawnWidth / cropWidth. Paths without copies stay as they are.
 */
export function layerVariantPath(path: string, drawnWidth: number, cropWidth = 1): string {
  return variantPath(path, Math.ceil(drawnWidth / Math.max(0.05, cropWidth || 1)))
}
