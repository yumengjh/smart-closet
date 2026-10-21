<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { BulbOutlined } from '@ant-design/icons-vue'
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
      <div class="recommend-inspiration-summary">
        <span class="recommend-inspiration-count"><strong>{{ data.applicableTemplates }}</strong> 个搭法今天适用<small class="muted"> / 共 {{ data.approvedTemplates }} 个</small></span>
        <span v-if="data.view.intent.description" class="recommend-inspiration-intent">{{ data.view.intent.description }}</span>
      </div>
      <RecommendationGroup v-if="data.view.outfits.length" :key="data.view.runId" :view="data.view" @expired="load" />
      <a-empty v-else :description="data.view.emptyReason || '今天没有能套用的搭法。'" />
      <section v-if="data.gaps.length" class="recommend-gaps" aria-label="差一件就能穿">
        <h4><BulbOutlined /> 差一件就能穿</h4>
        <ul>
          <li v-for="g in data.gaps" :key="g.templateId">
            <span class="recommend-gap-hint"><a-tag v-if="g.kind === 'TREND'" color="magenta">流行</a-tag>{{ g.hint }}</span>
            <small v-if="g.have.length" class="muted">已有：{{ g.have.join('、') }}</small>
          </li>
        </ul>
      </section>
      <p v-if="data.audienceSet === false" class="muted recommend-inspiration-meta">想要更合适的灵感？<RouterLink to="/settings?section=style">设置风格年龄感与着装取向</RouterLink>（都可不填）</p>
    </template>
  </div>
</template>
