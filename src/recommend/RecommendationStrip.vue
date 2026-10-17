<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RecommendIntentBar from './RecommendIntentBar.vue'
import RecommendationGroup from './RecommendationGroup.vue'
import InspirationBlock from './InspirationBlock.vue'
import { recommendApi } from './api'
import { latestRequest } from './latest'
import type { IntentInput, RecommendationView } from './types'

/** "今天穿什么" panel, shown as its own tab of the outfit page (design 8.1). Zero model calls. */
const MODE = 'yixu.recommend.strip-mode.v1'
const route = useRoute(); const router = useRouter()
const intent = ref<IntentInput>({ occasion: 'DAILY', temperatureC: null, avoidColors: [] })
const view = ref<RecommendationView | null>(null); const loading = ref(false); const error = ref('')
const required = ref<string | null>(null)
const mode = ref<'recommend' | 'inspiration'>(readMode())
function readMode() { try { return localStorage.getItem(MODE) === 'inspiration' ? 'inspiration' : 'recommend' } catch { return 'recommend' } }
watch(mode, v => { try { localStorage.setItem(MODE, v) } catch { /* storage blocked */ } })
const runs = latestRequest()
async function run() {
  const ticket = runs.next()
  loading.value = true; error.value = ''
  try {
    const next = await recommendApi.recommend({ ...intent.value, temperatureC: intent.value.temperatureC ?? undefined, requiredGarmentIds: required.value ? [required.value] : [], count: 3 })
    if (runs.isLatest(ticket)) view.value = next
  } catch (e) { if (runs.isLatest(ticket)) error.value = e instanceof Error ? e.message : '推荐暂时不可用。' }
  finally { if (runs.isLatest(ticket)) loading.value = false }
}
function clearRequired() { required.value = null; router.replace({ query: { ...route.query, with: undefined } }); run() }
onMounted(() => {
  recommendApi.profile().catch(() => {})
  // "用它搭一套" from a garment page arrives as ?with=<garmentId>.
  if (typeof route.query.with === 'string') { required.value = route.query.with; mode.value = 'recommend' }
  if (mode.value === 'recommend') run()
})
// Back/forward can change ?with without remounting; clearRequired() already nulls it first, so it does not re-run here.
watch(() => route.query.with, value => {
  const next = typeof value === 'string' ? value : null
  if (next === required.value) return
  required.value = next
  if (next) mode.value = 'recommend'
  if (mode.value === 'recommend') run()
})
watch(mode, m => { if (m === 'recommend' && !view.value && !loading.value) run() })
</script>
<template>
  <section class="recommend-strip" aria-label="今天穿什么">
    <div class="recommend-strip-top">
      <a-segmented v-model:value="mode" class="recommend-strip-mode" size="small" :options="[{ value: 'recommend', label: '为我搭配' }, { value: 'inspiration', label: '今日灵感' }]" aria-label="推荐方式" />
      <small class="muted">从你的衣柜按规则计算，不调用大模型；温度不填时按常住城市的天气</small>
    </div>
    <div v-if="mode === 'inspiration'" class="recommend-strip-body"><InspirationBlock /></div>
    <div v-show="mode === 'recommend'" class="recommend-strip-body">
      <RecommendIntentBar v-model="intent" :loading="loading" submit-label="重新推荐" @submit="run" />
      <a-alert v-if="required" type="info" show-icon class="recommend-required" message="围绕你选的那件衣物搭配"><template #action><a-button size="small" @click="clearRequired">不指定</a-button></template></a-alert>
      <a-alert v-if="error" type="warning" show-icon :message="error"><template #action><a-button size="small" @click="run">重试</a-button></template></a-alert>
      <div v-if="loading && !view" class="recommend-cards" aria-busy="true"><article v-for="i in 3" :key="i" class="recommend-card recommend-card-placeholder"><span class="recommend-preview-loading" /><span class="recommend-placeholder-line" /><span class="recommend-placeholder-line short" /></article></div>
      <RecommendationGroup v-else-if="view" :key="view.runId" :view="view" @expired="run" />
    </div>
  </section>
</template>
