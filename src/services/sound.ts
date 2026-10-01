import { readonly, ref } from 'vue'
import { getAnalyser, play, set, unlock, type CueName, type PlayHandle } from '@foleyjs/core'

const preferenceKey = 'yixu.sound.v1'
const enabled = ref(false)
try { enabled.value = localStorage.getItem(preferenceKey) === 'on' } catch { /* Storage may be unavailable. */ }
set({ theme: 'soft', volume: 0.3, space: 0.06, muted: !enabled.value })
export const soundEnabled = readonly(enabled)
let lastHover = -Infinity
let lastAction = -Infinity
let lastSlider = -Infinity
let current: PlayHandle | undefined
let actionSerial = 0

export function playSound(cue: CueName = 'tap') {
  if (!enabled.value || document.visibilityState !== 'visible') return
  try {
    actionSerial++
    const next = play(cue, { volume: 0.7 })
    if (next) { current?.stop(); current = next }
    lastAction = performance.now()
  } catch { /* Sound must never interrupt editing. */ }
}

export function sliderSound(position: number) {
  if (!enabled.value || document.visibilityState !== 'visible' || !Number.isFinite(position)) return
  const now = performance.now()
  if (now - lastSlider < 80) return
  try {
    actionSerial++
    const next = play('tick', { volume: 0.35, pitch: -4 + 8 * Math.max(0, Math.min(1, position)) })
    if (next) { current?.stop(); current = next }
    lastSlider = now
    lastAction = now
  } catch { /* A silent slider must still adjust normally. */ }
}

export function hoverSound(event: PointerEvent) {
  if (!enabled.value || event.pointerType !== 'mouse' || event.buttons || document.visibilityState !== 'visible') return
  const now = performance.now()
  if (now - lastHover < 180 || now - lastAction < 250) return
  // Hover does not unlock audio; wait for the user's first click/key after a reload.
  try {
    if (getAnalyser()?.context.state !== 'running') return
    play('tick', { volume: 0.25 })
    lastHover = now
  } catch { /* Browsers without audio can still browse normally. */ }
}

export function toggleSound() {
  enabled.value = !enabled.value
  try { localStorage.setItem(preferenceKey, enabled.value ? 'on' : 'off') } catch { /* Keep the session preference. */ }
  set({ muted: !enabled.value })
  if (enabled.value) playSound('on')
  else current?.stop()
}

export function unlockSound() {
  if (!enabled.value) return
  try { unlock() } catch { /* Audio is optional. */ }
}

// Delegate from the document so drawers, dropdowns and later-rendered controls
// share the same feedback. Explicit action cues take priority over this fallback.
const controls = 'button, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], input[type="checkbox"], input[type="radio"], .ant-select-selector, .ant-select-item-option, .ant-select-clear, .ant-input-clear-icon, .ant-segmented-item, .ant-radio-wrapper, .ant-checkbox-wrapper'
function soundControl(target: EventTarget | null) {
  const control = target instanceof Element ? target.closest(controls) : null
  if (!control || control.closest('[data-sound="off"], [disabled], [aria-disabled="true"], .ant-select-disabled, .ant-btn-loading, fieldset:disabled')) return null
  return control
}

export function installInteractionSounds() {
  let active = true
  let pressed: { control: Element; x: number; y: number; moved: boolean } | null = null
  let dragged: Element | null = null
  let dragEnded = 0
  function pointerDown(event: PointerEvent) {
    const control = soundControl(event.target)
    pressed = control ? { control, x: event.clientX, y: event.clientY, moved: false } : null
  }
  function pointerMove(event: PointerEvent) {
    if (pressed && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 5) pressed.moved = true
  }
  function pointerUp() {
    dragged = pressed?.moved ? pressed.control : null
    dragEnded = performance.now()
    pressed = null
  }
  function clicked(event: MouseEvent) {
    if (event.button !== 0) return
    const control = soundControl(event.target)
    if (!control) return
    // A released reorder handle may also generate a click; keep its drop cue.
    if (event.detail && dragged === control && performance.now() - dragEnded < 300) { dragged = null; return }
    const serial = actionSerial
    const switching = control.matches('[aria-pressed], [role="tab"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], input[type="checkbox"], input[type="radio"], .ant-select-selector, .ant-select-item-option, .ant-segmented-item, .ant-radio-wrapper, .ant-checkbox-wrapper')
    const cue = switching ? 'switch' : control.matches('a[href]') ? 'swoosh' : 'tap'
    // Wait until all click handlers finish; a capture-listener microtask can run
    // before Vue's handler when the browser dispatches a native event.
    window.setTimeout(() => { if (active && serial === actionSerial) playSound(cue) }, 0)
  }
  function hovered(event: PointerEvent) {
    const control = soundControl(event.target)
    if (!control || (event.relatedTarget instanceof Node && control.contains(event.relatedTarget))) return
    hoverSound(event)
  }
  function changed(event: Event) {
    // Native select menus do not deliver their option clicks to the document.
    if (event.target instanceof HTMLSelectElement && !event.target.disabled) playSound('switch')
  }
  document.addEventListener('pointerdown', pointerDown, true)
  document.addEventListener('pointermove', pointerMove, true)
  document.addEventListener('pointerup', pointerUp, true)
  document.addEventListener('pointercancel', pointerUp, true)
  document.addEventListener('click', clicked, true)
  document.addEventListener('pointerover', hovered, true)
  document.addEventListener('change', changed, true)
  return () => {
    active = false
    document.removeEventListener('pointerdown', pointerDown, true)
    document.removeEventListener('pointermove', pointerMove, true)
    document.removeEventListener('pointerup', pointerUp, true)
    document.removeEventListener('pointercancel', pointerUp, true)
    document.removeEventListener('click', clicked, true)
    document.removeEventListener('pointerover', hovered, true)
    document.removeEventListener('change', changed, true)
  }
}
