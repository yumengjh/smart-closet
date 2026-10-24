<script setup lang="ts">
import { ref } from 'vue'
import { App } from 'ant-design-vue'
import GarmentThumb from './GarmentThumb.vue'
import RecommendationGroup from './RecommendationGroup.vue'
import { recommendApi } from './api'
import { latestRequest } from './latest'
import type { RecommendationView } from './types'
import { sendToAssistant } from '../agent/assistantEvents'

/**
 * 指代选择卡 (design 8.2): the assistant's search matched several garments. Tapping one sends the pick back to the
 * assistant, which carries on with what it was doing (replace it on a board, explain it...); 「用它搭一套」 recommends around
 * it directly through the recommendation API with no further model round (design 2026-10-24).
 */
const props = defineProps<{ payload: { query?: string; total?: number; candidates?: { name: string; garmentIds: string[]; reasons?: string[]; displayUrl?: string | null }[] } }>()
const { message } = App.useApp()
const picked = ref(''); const loading = ref(false); const view = ref<RecommendationView | null>(null)
const picks = latestRequest()
const chosen = ref('')
function choose(index: number) {
  const c = props.payload.candidates?.[index]; if (!c) return
  chosen.value = c.garmentIds[0]; sendToAssistant(`选第 ${index + 1} 件「${c.name}」`)
}
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
    <small class="muted">“{{ payload.query }}”找到 {{ payload.total }} 件，点一下告诉助手是哪件；也可以直接用它搭一套（不调用大模型）：</small>
    <div class="garment-choice-options">
      <div v-for="(c, index) in payload.candidates" :key="c.garmentIds[0]" class="garment-choice-option">
        <a-button :type="chosen === c.garmentIds[0] ? 'primary' : 'default'" :disabled="!!chosen && chosen !== c.garmentIds[0]" :title="c.reasons?.join(' · ')" :aria-label="`就是这件：${c.name}`" @click="choose(index)">
          <GarmentThumb :garment-id="c.garmentIds[0]" :display-url="c.displayUrl" :alt="c.name" :size="64" /><span>{{ c.name }}</span>
        </a-button>
        <a-button type="link" size="small" :loading="loading && picked === c.garmentIds[0]" @click="pick(c.garmentIds[0])">用它搭一套</a-button>
      </div>
    </div>
    <RecommendationGroup v-if="view" :key="view.runId" :view="view" dense />
  </section>
</template>
