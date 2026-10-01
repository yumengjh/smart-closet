<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { OutfitScene } from '../domain/outfit'
import { drawOutfit } from '../domain/outfit-images'

const props = defineProps<{ scene: OutfitScene; title: string }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const failed = ref(false)
let revision = 0

async function render() {
  const current = ++revision
  failed.value = false
  try {
    const output = await drawOutfit(props.scene, 216, 270)
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
    <canvas v-show="!failed" ref="canvas" width="216" height="270" />
    <span v-if="failed">图片暂不可用</span>
  </div>
</template>
