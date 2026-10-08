<script setup lang="ts">
import { ref } from 'vue'
import { App } from 'ant-design-vue'
import { ThunderboltOutlined } from '@ant-design/icons-vue'
import RecommendIntentBar from './RecommendIntentBar.vue'
import { recommendApi } from './api'
import type { IntentInput, RecommendationView } from './types'

/** Assistant quick entry "今天穿什么" (design 8.1/8.4): calls the recommendation API directly — no model, no chat quota. */
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ result: [view: RecommendationView] }>()
const { message } = App.useApp()
const open = ref(false); const loading = ref(false)
const intent = ref<IntentInput>({ occasion: 'DAILY', temperatureC: null })
async function run() {
  loading.value = true
  try { emit('result', await recommendApi.recommend({ ...intent.value, temperatureC: intent.value.temperatureC ?? undefined, count: 3 })); open.value = false }
  catch (e) { message.error(e instanceof Error ? e.message : '推荐暂时不可用。') }
  finally { loading.value = false }
}
</script>
<template>
  <div class="recommend-quick">
    <a-popover v-model:open="open" trigger="click" placement="topLeft" title="今天穿什么">
      <template #content><div class="recommend-quick-panel"><RecommendIntentBar v-model="intent" compact :loading="loading" submit-label="出推荐" @submit="run" /><small class="muted">直接按规则计算，不调用大模型，也不占今天的对话次数。</small></div></template>
      <a-button size="small" :disabled="props.disabled"><ThunderboltOutlined />今天穿什么</a-button>
    </a-popover>
  </div>
</template>
