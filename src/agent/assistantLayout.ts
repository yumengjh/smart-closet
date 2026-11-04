// 'center' (清新改版 §3) is the chat window that grows out of the dock's 问鱼搭 pill in the lower middle; it is the default.
export type AssistantMode = 'center' | 'overlay' | 'docked' | 'floating'
export type AssistantLayout = { mode: AssistantMode; width: number; floatingHeight: number; centerWidth: number; centerHeight: number }
/** Saved layouts from before the redesign carry no version; they start once in the new centre window. */
export const LAYOUT_VERSION = 2
export const CENTER_WIDTH = 720
export const CENTER_HEIGHT = 680
export const DEFAULT_WIDTH = 460
export const DEFAULT_FLOATING_HEIGHT = 820
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback

export function migrateMode(mode: unknown, pin: string | null): AssistantMode { return mode === 'center' || mode === 'overlay' || mode === 'docked' || mode === 'floating' ? mode : pin === 'false' ? 'floating' : 'center' }
export function restoreLayout(raw: string | null, pin: string | null): AssistantLayout {
  let value: (Partial<AssistantLayout> & { version?: unknown }) | null = null
  try { value = JSON.parse(raw || 'null') } catch {}
  const mode = value && value.version !== LAYOUT_VERSION ? 'center' : migrateMode(value?.mode, pin)
  return { mode, centerWidth: finite(value?.centerWidth, CENTER_WIDTH), centerHeight: finite(value?.centerHeight, CENTER_HEIGHT), width: finite(value?.width, DEFAULT_WIDTH), floatingHeight: finite(value?.floatingHeight, DEFAULT_FLOATING_HEIGHT) }
}
export function widthBounds(viewportWidth: number, mode: AssistantMode) {
  const max = Math.max(0, Math.floor(Math.min(960, viewportWidth * .7, mode === 'docked' ? viewportWidth - 560 : viewportWidth - 32)))
  return { min: Math.min(360, max), max }
}
/** The centre window's limits: it stays centred above the dock and below the top bar (dockSpace = room the dock takes). */
export function centerBounds(viewport: { width: number; height: number }, dockSpace: number) {
  const maxWidth = Math.max(0, Math.min(1100, viewport.width - 32)), maxHeight = Math.max(0, viewport.height - dockSpace - 72)
  return { width: { min: Math.min(480, maxWidth), max: maxWidth }, height: { min: Math.min(360, maxHeight), max: maxHeight } }
}
/** The centre window's size: the saved (dragged) size kept within its limits. */
export function centerSize(viewport: { width: number; height: number }, dockSpace: number, preferred = { width: CENTER_WIDTH, height: CENTER_HEIGHT }) {
  const bounds = centerBounds(viewport, dockSpace)
  return { width: clampSize(preferred.width, bounds.width, CENTER_WIDTH), height: clampSize(preferred.height, bounds.height, CENTER_HEIGHT) }
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
