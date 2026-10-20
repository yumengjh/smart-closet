<script setup lang="ts">
import { ref } from 'vue'
import { App } from 'ant-design-vue'
import GarmentThumb from './GarmentThumb.vue'
import RecommendationGroup from './RecommendationGroup.vue'
import { recommendApi } from './api'
import { latestRequest } from './latest'
import type { RecommendationView } from './types'

/**
 * 指代选择卡 (design 8.2): the assistant's search matched several garments; tapping one recommends around it
 * directly through the recommendation API — no further model round.
 */
const props = defineProps<{ payload: { query?: string; total?: number; candidates?: { name: string; garmentIds: string[]; reasons?: string[]; displayUrl?: string | null }[] } }>()
const { message } = App.useApp()
const picked = ref(''); const loading = ref(false); const view = ref<RecommendationView | null>(null)
const picks = latestRequest()
async function pick(id: string) {
  const ticket = picks.next()
  picked.value = id; loading.value = true
  try { const next = await recommendApi.recommend({ requiredGarmentIds: [id], count: 3 }); if (picks.isLatest(ticket)) view.value = next }
  catch (e) { if (picks.isLatest(ticket)) message.error(e instanceof Error ? e.message : '推荐暂时不可用。') }
  finally { if (picks.isLatest(ticket)) loading.value = false }
}
</script>
<template>
  <section class="garment-choice" aria-label="选择你说的是哪一件">
    <small class="muted">“{{ payload.query }}”找到 {{ payload.total }} 件，点一下用它搭一套（不再调用大模型）：</small>
    <div class="garment-choice-options">
      <a-button v-for="c in payload.candidates" :key="c.garmentIds[0]" :type="picked === c.garmentIds[0] ? 'primary' : 'default'" :loading="loading && picked === c.garmentIds[0]" :title="c.reasons?.join(' · ')" @click="pick(c.garmentIds[0])">
        <GarmentThumb :garment-id="c.garmentIds[0]" :display-url="c.displayUrl" :alt="c.name" :size="64" /><span>{{ c.name }}</span>
      </a-button>
    </div>
    <RecommendationGroup v-if="view" :key="view.runId" :view="view" dense />
  </section>
</template>
