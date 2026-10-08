<script setup lang="ts">
import { onMounted, ref } from 'vue'
import RecommendationGroup from './RecommendationGroup.vue'
import { recommendApi } from './api'
import type { InspirationView } from './types'

/** 今日灵感 (P4): reviewed 搭法 filled with the user's own clothes, plus "差一件就能穿" hints. Zero model calls. */
const props = defineProps<{ temperatureC?: number | null }>()
const data = ref<InspirationView | null>(null); const loading = ref(false); const error = ref('')
async function load() {
  loading.value = true; error.value = ''
  try { data.value = await recommendApi.inspiration(props.temperatureC) }
  catch (e) { error.value = e instanceof Error ? e.message : '今日灵感暂时不可用。' }
  finally { loading.value = false }
}
defineExpose({ load })
onMounted(load)
</script>
<template>
  <div class="recommend-inspiration" aria-live="polite">
    <a-alert v-if="error" type="warning" show-icon :message="error"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <div v-else-if="loading && !data" class="recommend-cards"><a-skeleton v-for="i in 3" :key="i" active /></div>
    <template v-else-if="data">
      <p class="muted recommend-inspiration-meta">
        从 {{ data.approvedTemplates }} 个已审核搭法里挑出今天适用的 {{ data.applicableTemplates }} 个，用你衣柜里的衣服套进去{{ data.view.intent.description ? '；' + data.view.intent.description : '' }}
      </p>
      <RecommendationGroup v-if="data.view.outfits.length" :key="data.view.runId" :view="data.view" @expired="load" />
      <a-empty v-else :description="data.view.emptyReason || '今天没有能套用的搭法。'" />
      <div v-if="data.gaps.length" class="recommend-gaps">
        <span class="recommend-intent-label">差一件就能穿</span>
        <ul>
          <li v-for="g in data.gaps" :key="g.templateId">
            <a-tag v-if="g.kind === 'TREND'" color="magenta">流行</a-tag>{{ g.hint }}
            <small v-if="g.have.length" class="muted">（已有：{{ g.have.join('、') }}）</small>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
