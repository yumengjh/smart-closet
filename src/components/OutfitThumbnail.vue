<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { OutfitScene } from '../domain/outfit'
import { drawOutfit } from '../domain/outfit-images'

/**
 * {@code resolution} is the minimum drawing width. The canvas follows the size it is shown at times the screen's pixel
 * ratio (issue #4: a 216 px drawing stretched over a 300 px card on a 2× screen looked blurry), in 120 px steps so a
 * resize does not redraw on every pixel, and at most 960 px wide.
 */
const props = withDefaults(defineProps<{ scene: OutfitScene; title: string; resolution?: number }>(), { resolution: 216 })
const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const failed = ref(false)
const shown = ref(0)
const width = computed(() => Math.min(960, Math.max(props.resolution, Math.ceil(shown.value / 120) * 120)))
const height = computed(() => Math.round(width.value * 1.25))
let revision = 0
let observer: ResizeObserver | null = null

async function render() {
  const current = ++revision
  failed.value = false
  try {
    const output = await drawOutfit(props.scene, width.value, height.value)
    if (current !== revision || !canvas.value) return
    const context = canvas.value.getContext('2d')
    if (context) { context.clearRect(0, 0, canvas.value.width, canvas.value.height); context.drawImage(output, 0, 0) }
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
watch(width, () => { void render() })
</script>

<template>
  <div ref="root" class="outfit-thumbnail" :aria-label="`${title}的搭配缩略图`" role="img">
    <canvas v-show="!failed" ref="canvas" :width="width" :height="height" />
    <span v-if="failed">图片暂不可用</span>
  </div>
</template>
