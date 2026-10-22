<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { OutfitScene } from '../domain/outfit'
import { drawOutfit } from '../domain/outfit-images'
import { useThemeStore } from '../stores/theme'
import { tokens } from '../theme/tokens'

/**
 * {@code resolution} is the minimum drawing width. The canvas follows the size it is shown at times the screen's pixel
 * ratio (issue #4: a 216 px drawing stretched over a 300 px card on a 2× screen looked blurry), in 120 px steps so a
 * resize does not redraw on every pixel, and at most 960 px wide.
 */
const props = withDefaults(defineProps<{ scene: OutfitScene; title: string; resolution?: number }>(), { resolution: 216 })
const appearance = useThemeStore()
const board = computed(() => tokens[appearance.isDark ? 'dark' : 'light'].board)
const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const failed = ref(false)
const shown = ref(0)
// The picture is drawn only once its garment images have loaded; until then a soft placeholder holds the space instead of an empty frame.
const ready = ref(false)
const width = computed(() => Math.min(960, Math.max(props.resolution, Math.ceil(shown.value / 120) * 120)))
const height = computed(() => Math.round(width.value * 1.25))
let revision = 0
let observer: ResizeObserver | null = null

async function render() {
  const current = ++revision
  failed.value = false
  try {
    // On-screen previews draw from scaled copies; only the exported PNG needs the originals.
    const output = await drawOutfit(props.scene, width.value, height.value, board.value, true)
    if (current !== revision || !canvas.value) return
    const context = canvas.value.getContext('2d')
    if (context) { context.clearRect(0, 0, canvas.value.width, canvas.value.height); context.drawImage(output, 0, 0) }
    ready.value = true
  } catch {
    if (current === revision) failed.value = true
  }
}
function measure() {
  const box = root.value?.getBoundingClientRect()
  if (!box) return
  // The drawing is 4:5; whichever side limits the shown size decides how many pixels are needed.
  const cssWidth = Math.min(box.width, box.height > 0 ? box.height / 1.25 : box.width)
  shown.value = Math.round(cssWidth * (window.devicePixelRatio || 1))
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && root.value) { observer = new ResizeObserver(measure); observer.observe(root.value) }
  void render()
})
onBeforeUnmount(() => { observer?.disconnect(); revision++ })
watch(() => JSON.stringify(props.scene), () => { void render() })
watch([width, board], () => { void render() })
</script>

<template>
  <div ref="root" class="outfit-thumbnail" :aria-label="`${title}的搭配缩略图`" role="img">
    <span v-if="!ready && !failed" class="outfit-thumbnail-loading" aria-hidden="true" />
    <canvas v-show="!failed" ref="canvas" :class="{ ready }" :width="width" :height="height" />
    <span v-if="failed" class="outfit-thumbnail-failed">图片暂不可用</span>
  </div>
</template>

<style scoped>
.outfit-thumbnail { position: relative; }
.outfit-thumbnail canvas { opacity: 0; transition: opacity .25s ease; }
.outfit-thumbnail canvas.ready { opacity: 1; }
.outfit-thumbnail-loading { position: absolute; inset: 0; background: linear-gradient(100deg, var(--surface-alt) 30%, var(--surface) 50%, var(--surface-alt) 70%); background-size: 220% 100%; animation: outfit-shimmer 1.4s ease-in-out infinite; }
@keyframes outfit-shimmer { from { background-position: 110% 0; } to { background-position: -110% 0; } }
@media (prefers-reduced-motion: reduce) { .outfit-thumbnail-loading { animation: none; } .outfit-thumbnail canvas { transition: none; } }
</style>
