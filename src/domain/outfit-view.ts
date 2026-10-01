export const MIN_VIEW_ZOOM = .25
export const MAX_VIEW_ZOOM = 4

export function outfitViewGeometry(width: number, height: number, zoom: number, inset = 48) {
  const scale = Math.max(.04, Math.min((width - inset) / 1080, (height - inset) / 1350)) * zoom
  const stageWidth = Math.round(1080 * scale)
  const stageHeight = Math.round(1350 * scale)
  // Half a viewport of padding on each side keeps every edge reachable and
  // leaves room to preserve the pointer anchor while zooming a small board.
  return { scale, stageWidth, stageHeight,
    spaceWidth: Math.max(width, stageWidth + 48) + width,
    spaceHeight: Math.max(height, stageHeight + 48) + height }
}

export function outfitWheelZoom(zoom: number, delta: number, mode: number, height: number) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? height : 1)
  return Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, zoom * Math.exp(-pixels * .002)))
}
