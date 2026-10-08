<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DownOutlined, UpOutlined } from '@ant-design/icons-vue'
import RecommendIntentBar from './RecommendIntentBar.vue'
import RecommendationGroup from './RecommendationGroup.vue'
import InspirationBlock from './InspirationBlock.vue'
import { recommendApi } from './api'
import type { IntentInput, RecommendationView } from './types'

/** "今天穿什么" strip at the top of the outfit list (design 8.1). Zero model calls; collapsed state stays on this device. */
const COLLAPSED = 'yixu.recommend.strip-collapsed.v1'
const MODE = 'yixu.recommend.strip-mode.v1'
const route = useRoute(); const router = useRouter()
const collapsed = ref(read())
const intent = ref<IntentInput>({ occasion: 'DAILY', temperatureC: null, avoidColors: [] })
const view = ref<RecommendationView | null>(null); const loading = ref(false); const error = ref('')
const required = ref<string | null>(null)
const mode = ref<'recommend' | 'inspiration'>(readMode())
function readMode() { try { return localStorage.getItem(MODE) === 'inspiration' ? 'inspiration' : 'recommend' } catch { return 'recommend' } }
watch(mode, v => { try { localStorage.setItem(MODE, v) } catch { /* storage blocked */ } })
function read() { try { return localStorage.getItem(COLLAPSED) === '1' } catch { return false } }
watch(collapsed, v => { try { localStorage.setItem(COLLAPSED, v ? '1' : '0') } catch { /* storage blocked */ } })
async function run() {
  loading.value = true; error.value = ''
  try { view.value = await recommendApi.recommend({ ...intent.value, temperatureC: intent.value.temperatureC ?? undefined, requiredGarmentIds: required.value ? [required.value] : [], count: 3 }) }
  catch (e) { error.value = e instanceof Error ? e.message : '推荐暂时不可用。' }
  finally { loading.value = false }
}
function clearRequired() { required.value = null; router.replace({ query: { ...route.query, with: undefined } }); run() }
onMounted(() => {
  recommendApi.profile().catch(() => {})
  // "用它搭一套" from a garment page arrives as ?with=<garmentId>.
  if (typeof route.query.with === 'string') { required.value = route.query.with; collapsed.value = false; mode.value = 'recommend' }
  if (!collapsed.value && mode.value === 'recommend') run()
})
watch([collapsed, mode], ([c, m]) => { if (!c && m === 'recommend' && !view.value && !loading.value) run() })
</script>
<template>
  <section class="recommend-strip" aria-labelledby="recommend-strip-title">
    <header class="recommend-strip-head">
      <div><h2 id="recommend-strip-title">今天穿什么</h2><small class="muted">从你的衣柜按规则计算，不调用大模型；温度不填时按常住城市的天气</small></div>
      <a-button type="text" :aria-expanded="!collapsed" @click="collapsed = !collapsed"><component :is="collapsed ? DownOutlined : UpOutlined" />{{ collapsed ? '展开' : '收起' }}</a-button>
    </header>
    <a-segmented v-show="!collapsed" v-model:value="mode" class="recommend-strip-mode" :options="[{ value: 'recommend', label: '为我搭配' }, { value: 'inspiration', label: '今日灵感' }]" aria-label="推荐方式" />
    <div v-if="!collapsed && mode === 'inspiration'" class="recommend-strip-body"><InspirationBlock /></div>
    <div v-show="!collapsed && mode === 'recommend'" class="recommend-strip-body">
      <RecommendIntentBar v-model="intent" :loading="loading" submit-label="重新推荐" @submit="run" />
      <a-alert v-if="required" type="info" show-icon class="recommend-required" message="围绕你选的那件衣物搭配"><template #action><a-button size="small" @click="clearRequired">不指定</a-button></template></a-alert>
      <a-alert v-if="error" type="warning" show-icon :message="error"><template #action><a-button size="small" @click="run">重试</a-button></template></a-alert>
      <div v-if="loading && !view" class="recommend-cards"><a-skeleton v-for="i in 3" :key="i" active /></div>
      <RecommendationGroup v-else-if="view" :key="view.runId" :view="view" @expired="run" />
    </div>
  </section>
</template>
