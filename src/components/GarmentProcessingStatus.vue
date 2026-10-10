<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { request, usingMocks } from '../services/api'

/**
 * 后台处理状态（issue #2）：which background steps have run for this garment — recognition, colours, fingerprint,
 * description and image vectors, picture style, duplicate check — so it is visible whether a step was ever done.
 */
type Step = { key: string; label: string; state: 'DONE' | 'PENDING' | 'OUTDATED' | 'UNAVAILABLE' | 'NOT_APPLICABLE'; detail: string; atMs: number | null }
const props = defineProps<{ garmentId: string; revision?: number }>()
const steps = ref<Step[]>([]); const error = ref(''); const loading = ref(false)
const STATE: Record<Step['state'], { label: string; color: string }> = {
  DONE: { label: '已完成', color: 'success' }, PENDING: { label: '未完成', color: 'processing' }, OUTDATED: { label: '需更新', color: 'warning' },
  UNAVAILABLE: { label: '不可用', color: 'default' }, NOT_APPLICABLE: { label: '不适用', color: 'default' },
}
const time = (ms: number | null) => ms ? new Date(ms).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
async function load() {
  if (usingMocks) { steps.value = []; return }
  loading.value = true; error.value = ''
  try { steps.value = (await request<{ steps: Step[] }>(`/api/garments/${props.garmentId}/processing-status`)).steps }
  catch (e) { error.value = e instanceof Error ? e.message : '处理状态暂时无法读取。' }
  finally { loading.value = false }
}
onMounted(load); watch(() => [props.garmentId, props.revision], load)
</script>
<template>
  <section class="garment-processing-status" aria-label="后台处理状态">
    <h2>后台处理状态 <a-button type="link" size="small" :loading="loading" @click="load">刷新</a-button></h2>
    <a-alert v-if="error" type="warning" show-icon :message="error" />
    <p v-else-if="usingMocks" class="muted">演示模式不显示后台处理状态。</p>
    <a-descriptions v-else :column="1" size="small" bordered>
      <a-descriptions-item v-for="s in steps" :key="s.key" :label="s.label">
        <a-tag :color="STATE[s.state].color">{{ STATE[s.state].label }}</a-tag><span>{{ s.detail }}</span><small v-if="s.atMs" class="muted"> · {{ time(s.atMs) }}</small>
      </a-descriptions-item>
    </a-descriptions>
  </section>
</template>
<style scoped>
.garment-processing-status { margin-bottom: 20px; }
.garment-processing-status h2 { display: flex; align-items: center; gap: 4px; font-size: 15px; margin: 0 0 10px; }
</style>
