<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RightOutlined } from '@ant-design/icons-vue'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import type { OutfitScene } from '../domain/outfit'
import { recommendApi } from './api'
import { outfitScene } from './sceneCache'
import type { RecommendedOutfit } from './types'

/** One-line peek at today's top recommendation on the "我的搭配" tab, so the other tab stays easy to notice. Silent when unavailable. */
const emit = defineEmits<{ open: [] }>()
const outfit = ref<RecommendedOutfit | null>(null); const scene = ref<OutfitScene | null>(null)
onMounted(async () => {
  try {
    const view = await recommendApi.recommend({ occasion: 'DAILY', requiredGarmentIds: [], count: 1 })
    const first = view.outfits[0]; if (!first) return
    outfit.value = first; scene.value = await outfitScene(first)
  } catch { outfit.value = null }
})
</script>

<template>
  <a-button v-if="outfit" class="today-teaser" block @click="emit('open')">
    <span class="today-teaser-thumb"><OutfitThumbnail v-if="scene" :scene="scene" :title="outfit.name" /></span>
    <span class="today-teaser-copy"><small>今天穿什么 · 为你挑的一套</small><strong>{{ outfit.name }}</strong><em>{{ outfit.highlights[0] || '按今天的场景和天气算出' }}</em></span>
    <span class="today-teaser-more">看更多<RightOutlined /></span>
  </a-button>
</template>

<style scoped>
.today-teaser.ant-btn { display: flex; align-items: center; gap: 14px; height: auto; margin: 0 0 18px; padding: 10px 14px; text-align: left; border-radius: var(--radius-lg, 14px); }
.today-teaser-thumb { position: relative; flex: none; width: 56px; aspect-ratio: 4 / 5; border-radius: 8px; overflow: hidden; background: var(--surface-alt); }
.today-teaser-thumb :deep(.outfit-thumbnail) { position: absolute; inset: 0; }
.today-teaser-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; line-height: 1.4; }
.today-teaser-copy small { color: var(--muted-copy); font-size: 12px; }
.today-teaser-copy strong { font-size: 15px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.today-teaser-copy em { font-style: normal; font-size: 13px; color: var(--muted-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.today-teaser-more { flex: none; display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--muted-strong); }
</style>
