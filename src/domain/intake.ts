export function eligible(visibleFraction: number, keyDetailsVisible: boolean, strategy: string): boolean {
  return strategy !== 'SMART' || visibleFraction >= .8 && keyDetailsVisible
}
export function imagePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, naturalWidth: number, naturalHeight: number) {
  const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight)
  const width = naturalWidth * scale, height = naturalHeight * scale
  const x = (clientX - rect.left - (rect.width - width) / 2) / width
  const y = (clientY - rect.top - (rect.height - height) / 2) / height
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null
}
export function generationUnits(count: number, groupSize: number) { return Math.ceil(count / groupSize) }
