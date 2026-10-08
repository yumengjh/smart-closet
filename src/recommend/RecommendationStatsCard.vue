<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { recommendApi } from './api'
import type { RecommendationStats } from './types'

/** 推荐效果与成本 (P4): how often recommendations are actually used, and what the model-backed parts cost. */
const SOURCES: Record<string, string> = { PAGE: '推荐区', AGENT: '助手', INSPIRATION: '今日灵感', SWAP: '换一件', MORE: '换一批' }
const days = ref(30); const stats = ref<RecommendationStats | null>(null); const loading = ref(false); const error = ref('')
async function load() {
  loading.value = true; error.value = ''
  try { stats.value = await recommendApi.stats(days.value) }
  catch (e) { error.value = e instanceof Error ? e.message : '统计暂时不可用。' }
  finally { loading.value = false }
}
function pct(v: number | null) { return v === null ? '—' : `${Math.round(v * 100)}%` }
onMounted(load)
</script>
<template>
  <section class="settings-card recommend-stats">
    <h3>推荐效果与成本</h3>
    <a-segmented v-model:value="days" :options="[{ value: 7, label: '近 7 天' }, { value: 30, label: '近 30 天' }, { value: 90, label: '近 90 天' }]" aria-label="统计范围" @change="load" />
    <a-alert v-if="error" type="warning" show-icon :message="error" />
    <a-skeleton v-else-if="loading && !stats" active :paragraph="{ rows: 3 }" />
    <template v-else-if="stats">
      <a-descriptions :column="{ xs: 1, sm: 2, md: 3 }" size="small" title="效果">
        <a-descriptions-item label="推荐出的搭配">{{ stats.effect.shown }} 套</a-descriptions-item>
        <a-descriptions-item label="采用">{{ stats.effect.adopted }} 套（{{ pct(stats.effect.adoptionRate) }}）</a-descriptions-item>
        <a-descriptions-item label="点赞 / 点踩">{{ stats.effect.liked }} / {{ stats.effect.disliked }}（好评 {{ pct(stats.effect.likeRate) }}）</a-descriptions-item>
        <a-descriptions-item label="在搭台打开">{{ stats.effect.openedInWorkspace }} 套</a-descriptions-item>
        <a-descriptions-item label="3 天内穿了">{{ stats.effect.wornWithin3Days }} 套</a-descriptions-item>
        <a-descriptions-item label="换一件">{{ stats.effect.swaps }} 次</a-descriptions-item>
      </a-descriptions>
      <p v-if="Object.keys(stats.effect.bySource).length" class="muted recommend-stats-sources">
        <span v-for="(row, source) in stats.effect.bySource" :key="source">{{ SOURCES[source] || source }}：{{ row.adopted }}/{{ row.shown }}</span>
      </p>
      <a-descriptions :column="{ xs: 1, sm: 2, md: 3 }" size="small" title="成本">
        <a-descriptions-item label="本地计算的推荐">{{ stats.cost.zeroModelRecommendations }} 套，不花模型费</a-descriptions-item>
        <a-descriptions-item label="助手消息">{{ stats.cost.agentMessages }} 条</a-descriptions-item>
        <a-descriptions-item label="识图/生图额度">{{ stats.cost.imageCredits }} 次</a-descriptions-item>
        <a-descriptions-item label="助手 token">输入 {{ stats.cost.inputTokens }} · 输出 {{ stats.cost.outputTokens }}<template v-if="stats.cost.unknownUsage">（{{ stats.cost.unknownUsage }} 次未上报）</template></a-descriptions-item>
      </a-descriptions>
      <p class="muted">{{ stats.effect.definition }}。{{ stats.cost.note }}。</p>
    </template>
  </section>
</template>
<style scoped>
.recommend-stats { display: grid; gap: 12px; }
.recommend-stats-sources { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: -6px 0 0; font-size: 13px; }
</style>
