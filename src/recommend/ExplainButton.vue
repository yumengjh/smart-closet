<script setup lang="ts">
import { ref } from 'vue'
import { QuestionCircleOutlined } from '@ant-design/icons-vue'
import { recommendApi } from './api'
import type { Explanation } from './types'

/** "为什么没推荐它 / 为什么排第几": reads the run's rule trace (D27, D33), zero model calls. */
const props = withDefaults(defineProps<{ runId: string; garmentId?: string; outfitKey?: string; label?: string }>(), { label: '为什么' })
const open = ref(false); const loading = ref(false); const error = ref(''); const data = ref<Explanation | null>(null)
async function show(visible: boolean) {
  open.value = visible
  if (!visible || data.value || loading.value) return
  loading.value = true; error.value = ''
  try { data.value = await recommendApi.explain(props.runId, { garmentId: props.garmentId, outfitKey: props.outfitKey }) }
  catch (e) { error.value = e instanceof Error ? e.message : '暂时无法解释。' }
  finally { loading.value = false }
}
const rules = () => (data.value?.outfit || data.value?.bestOutfit)?.rules.filter(r => r.hit) || []
</script>
<template>
  <a-popover :open="open" trigger="click" placement="left" overlay-class-name="recommend-explain-popover" @open-change="show">
    <template #title>推荐依据</template>
    <template #content>
      <a-skeleton v-if="loading" active :paragraph="{ rows: 2 }" :title="false" />
      <a-alert v-else-if="error" type="warning" show-icon :message="error" />
      <template v-else-if="data">
        <p v-for="(line, i) in data.summary" :key="i" class="recommend-explain-line">{{ line }}</p>
        <ul v-if="rules().length" class="recommend-rule-list" aria-label="命中的规则">
          <li v-for="r in rules()" :key="r.id" :class="r.delta < 0 ? 'is-negative' : 'is-positive'"><span>{{ r.label }}</span><strong>{{ r.delta > 0 ? '+' : '' }}{{ r.delta }}</strong><small v-if="r.evidence">{{ r.evidence }}</small></li>
        </ul>
      </template>
    </template>
    <a-button type="link" size="small" class="recommend-explain-button"><QuestionCircleOutlined />{{ label }}</a-button>
  </a-popover>
</template>
