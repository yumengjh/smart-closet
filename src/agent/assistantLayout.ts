export type AssistantMode = 'overlay' | 'docked' | 'floating'
export type AssistantLayout = { mode: AssistantMode; width: number; floatingHeight: number }
export const DEFAULT_WIDTH = 460
export const DEFAULT_FLOATING_HEIGHT = 820
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback

export function migrateMode(mode: unknown, pin: string | null): AssistantMode { return mode === 'overlay' || mode === 'docked' || mode === 'floating' ? mode : pin === 'false' ? 'floating' : 'overlay' }
export function restoreLayout(raw: string | null, pin: string | null): AssistantLayout {
  let value: Partial<AssistantLayout> | null = null
  try { value = JSON.parse(raw || 'null') } catch {}
  return { mode: migrateMode(value?.mode, pin), width: finite(value?.width, DEFAULT_WIDTH), floatingHeight: finite(value?.floatingHeight, DEFAULT_FLOATING_HEIGHT) }
}
export function widthBounds(viewportWidth: number, mode: AssistantMode) {
  const max = Math.max(0, Math.floor(Math.min(960, viewportWidth * .7, mode === 'docked' ? viewportWidth - 560 : viewportWidth - 32)))
  return { min: Math.min(360, max), max }
}
export function heightBounds(viewportHeight: number) { const max = Math.max(0, viewportHeight - 32); return { min: Math.min(420, max), max } }
export function clampSize(value: number, bounds: { min: number; max: number }, fallback: number) { return Math.max(bounds.min, Math.min(bounds.max, finite(value, fallback))) }
export function clampWidth(value: number, viewportWidth: number, mode: AssistantMode) { return clampSize(value, widthBounds(viewportWidth, mode), DEFAULT_WIDTH) }
export function clampHeight(value: number, viewportHeight: number) { return clampSize(value, heightBounds(viewportHeight), DEFAULT_FLOATING_HEIGHT) }
export function clampPosition(point: { x: number; y: number }, viewport: { width: number; height: number }, size: { width: number; height: number }) { return { x: Math.max(8, Math.min(viewport.width - size.width - 8, point.x)), y: Math.max(8, Math.min(viewport.height - size.height - 8, point.y)) } }
export function keyboardSize(key: string, value: number, bounds: { min: number; max: number }, direction = 1) {
  if (key === 'Home') return bounds.min
  if (key === 'End') return bounds.max
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return null
  return clampSize(value + (key === 'ArrowLeft' || key === 'ArrowUp' ? -24 : 24) * direction, bounds, value)
}
