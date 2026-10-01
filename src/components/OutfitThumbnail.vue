<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { OutfitScene } from '../domain/outfit'
import { drawOutfit } from '../domain/outfit-images'

const props = withDefaults(defineProps<{ scene: OutfitScene; title: string; resolution?: number }>(), { resolution: 216 })
const canvas = ref<HTMLCanvasElement | null>(null)
const failed = ref(false)
let revision = 0

async function render() {
  const current = ++revision
  failed.value = false
  try {
    const output = await drawOutfit(props.scene, props.resolution, Math.round(props.resolution * 1.25))
    if (current !== revision || !canvas.value) return
    const context = canvas.value.getContext('2d')
    if (context) context.drawImage(output, 0, 0)
  } catch {
    if (current === revision) failed.value = true
  }
}

onMounted(() => { void render() })
watch(() => JSON.stringify(props.scene), () => { void render() })
</script>

<template>
  <div class="outfit-thumbnail" :aria-label="`${title}的搭配缩略图`" role="img">
    <canvas v-show="!failed" ref="canvas" :width="resolution" :height="Math.round(resolution * 1.25)" />
    <span v-if="failed">图片暂不可用</span>
  </div>
</template>
