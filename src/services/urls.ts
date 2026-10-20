import { createApiUrls } from '../domain/api-url'
import { variantPath, variantSrcset } from '../domain/image-variants'

export const { apiUrl, mediaUrl, isApiMedia } = createApiUrls(import.meta.env.VITE_API_BASE_URL || '')

/** A smaller copy for lists and previews (see domain/image-variants); originals stay on mediaUrl. */
export function thumbUrl(path: string | null | undefined, width: number): string | undefined {
  return mediaUrl(variantPath(path, width))
}
export function thumbSrcset(path: string | null | undefined, widths: readonly number[]): string | undefined {
  return variantSrcset(path, widths, p => mediaUrl(p) ?? p)
}
