<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { WarningOutlined } from '@ant-design/icons-vue'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import type { OutfitScene } from '../domain/outfit'
import RecommendationFeedback from './RecommendationFeedback.vue'
import { outfitScene } from './sceneCache'
import type { RecommendedOutfit } from './types'

/** Compact recommendation card (design 8.3), shared by the outfit page strip and the assistant. */
const props = defineProps<{ outfit: RecommendedOutfit }>()
const emit = defineEmits<{ open: []; workspace: [] }>()
const scene = ref<OutfitScene | null>(null); const failed = ref(false)
async function load() { failed.value = false; try { scene.value = await outfitScene(props.outfit) } catch { failed.value = true } }
onMounted(load); watch(() => props.outfit.key, load)
</script>
<template>
  <article class="recommend-card" :aria-label="`推荐搭配 ${outfit.name}`">
    <a-button type="text" class="recommend-card-preview" :aria-label="`查看${outfit.name}的详情`" @click="emit('open')">
      <OutfitThumbnail v-if="scene" :scene="scene" :title="outfit.name" /><a-skeleton-image v-else-if="!failed" /><span v-else class="muted">预览无法加载</span>
    </a-button>
    <h3><span>{{ outfit.name }}</span><span class="recommend-score" :aria-label="`总分 ${outfit.score}`">{{ Math.round(outfit.score) }}<small>分</small></span></h3>
    <div v-if="outfit.tags.length" class="recommend-tags"><a-tag v-for="tag in outfit.tags" :key="tag" :color="tag === '新尝试' ? 'blue' : tag.endsWith('没穿了') ? 'gold' : 'green'">{{ tag }}</a-tag></div>
    <ul class="recommend-highlights"><li v-for="h in outfit.highlights.slice(0, 3)" :key="h">{{ h }}</li></ul>
    <ul v-if="outfit.warnings.length" class="recommend-warnings"><li><WarningOutlined />{{ outfit.warnings[0] }}<template v-if="outfit.warnings.length > 1"> 等 {{ outfit.warnings.length }} 条</template></li></ul>
    <footer class="recommend-card-actions">
      <RecommendationFeedback :log-id="outfit.logId" :garments="outfit.garments" />
      <a-button size="small" @click="emit('open')">详情</a-button>
      <a-button size="small" type="primary" @click="emit('workspace')">在搭台打开</a-button>
    </footer>
  </article>
</template>
