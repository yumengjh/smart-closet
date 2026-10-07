import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'

// Store viewport-relative positions so a resize never strands a floating control.
// With `snap`, a released control settles against the nearer side edge, like a docked companion.
export function useFloatingPosition(key: Ref<string>, size: Ref<{ width: number; height: number }>, bottom: () => number, options: { snap?: boolean } = {}) {
  const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
  const position = ref<{ x: number; y: number } | null>(null)
  const dragging = ref(false)
  let origin: { pointer: number; x: number; y: number; left: number; top: number } | undefined
  let suppressClick = false
  const bounds = computed(() => ({ x: Math.max(8, viewport.value.width - size.value.width - 8), y: Math.max(8, viewport.value.height - size.value.height - 8) }))
  const coordinates = computed(() => ({ x: Math.max(8, Math.min(bounds.value.x, position.value?.x ?? viewport.value.width - size.value.width - 24)), y: Math.max(8, Math.min(bounds.value.y, position.value?.y ?? viewport.value.height - size.value.height - bottom())) }))
  const style = computed(() => ({ left: `${coordinates.value.x}px`, top: `${coordinates.value.y}px` }))
  const side = computed<'left' | 'right'>(() => coordinates.value.x + size.value.width / 2 < viewport.value.width / 2 ? 'left' : 'right')
  const settling = ref(false)
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  function snapToEdge() {
    if (!options.snap) return
    position.value = { x: side.value === 'left' ? 8 : bounds.value.x, y: coordinates.value.y }
    settling.value = true; clearTimeout(settleTimer); settleTimer = setTimeout(() => { settling.value = false }, 420)
  }
  function restore() {
    position.value = null
    try { const value = JSON.parse(localStorage.getItem(key.value) || 'null'); if (Number.isFinite(value?.x) && Number.isFinite(value?.y)) position.value = { x: value.x * bounds.value.x, y: value.y * bounds.value.y } } catch {}
  }
  function persist() { try { localStorage.setItem(key.value, JSON.stringify({ x: coordinates.value.x / bounds.value.x, y: coordinates.value.y / bounds.value.y })) } catch {} }
  function start(event: PointerEvent) {
    if (event.button !== 0 || (event.target as Element).closest('input, a, [data-no-drag]')) return
    origin = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: coordinates.value.x, top: coordinates.value.y }
    suppressClick = false
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent) {
    if (!origin || event.pointerId !== origin.pointer) return
    if (!dragging.value && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) <= 5) return
    event.preventDefault(); dragging.value = true; suppressClick = true
    position.value = { x: Math.max(8, Math.min(bounds.value.x, origin.left + event.clientX - origin.x)), y: Math.max(8, Math.min(bounds.value.y, origin.top + event.clientY - origin.y)) }
  }
  function end() { if (origin && dragging.value) { snapToEdge(); persist() } origin = undefined; dragging.value = false }
  function clicked() { if (suppressClick) { suppressClick = false; return false } return true }
  function keyboard(event: KeyboardEvent) {
    const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key]
    if (!delta) return
    event.preventDefault()
    // Snapped controls only live on the edges, so horizontal keys jump straight to a side.
    const x = options.snap && delta[0] ? (delta[0] < 0 ? 8 : bounds.value.x) : coordinates.value.x + delta[0]!
    position.value = { x, y: coordinates.value.y + delta[1]! }; persist()
  }
  function resize() {
    const previous = bounds.value
    const relative = position.value ? { x: coordinates.value.x / previous.x, y: coordinates.value.y / previous.y } : null
    viewport.value = { width: window.innerWidth, height: window.innerHeight }
    if (relative) position.value = { x: relative.x * bounds.value.x, y: relative.y * bounds.value.y }
  }
  watch(key, restore)
  onMounted(() => { restore(); window.addEventListener('resize', resize) })
  onUnmounted(() => { clearTimeout(settleTimer); window.removeEventListener('resize', resize) })
  return { style, side, dragging, settling, start, move, end, clicked, keyboard }
}
